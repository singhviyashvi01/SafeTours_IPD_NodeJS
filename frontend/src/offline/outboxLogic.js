'use strict';

/**
 * Outbox rules (pure: no storage, no clock, no randomness of its own). The SQLite store and the runner apply
 * these; keeping them here makes them unit-testable.
 *
 * Row: { id, type, payload, idempotencyKey, createdAt, attempts, nextRetryAt, status, lastError, sentAt }
 *   status  pending   waiting to be sent (nextRetryAt says when)
 *           sending   a request is in flight
 *           sent      the server accepted it (kept briefly for the history list)
 *           failed    a retryable error kept happening and the attempt limit was reached; the user can retry
 *           dead      the server rejected it for good (4xx): it will not be retried by itself
 */
const PROTECTED_TYPES = ['sos', 'sos_cancel'];

const isProtected = (type) => PROTECTED_TYPES.includes(type);
const isLive = (row) => row.status !== 'sent';

/**
 * Delay before the next try, after `attempts` failed tries (attempts >= 1):
 * min(maxMs, baseMs * factor^(attempts-1)), then spread by +/- jitter (rand() in [0,1)).
 */
function backoffDelay(attempts, backoff, rand = Math.random) {
  const n = Math.max(1, attempts);
  const raw = Math.min(backoff.maxMs, backoff.baseMs * Math.pow(backoff.factor, n - 1));
  const spread = 1 - backoff.jitter + 2 * backoff.jitter * rand();
  return Math.max(0, Math.round(raw * spread));
}

/**
 * HTTP / network outcome -> what to do with the row.
 *   sent   2xx
 *   retry  no response (network error), 408, 429, 5xx, and anything unexpected (1xx / 3xx)
 *   dead   any other 4xx: the server understood the request and refused it, so repeating it cannot help
 */
function classifyResult({ status, networkError } = {}) {
  if (networkError || status === undefined || status === null || status === 0) return 'retry';
  if (status >= 200 && status < 300) return 'sent';
  if (status === 408 || status === 429) return 'retry';
  if (status >= 400 && status < 500) return 'dead';
  return 'retry';
}

/**
 * The row fields to write after one attempt.
 * @param {Object} row
 * @param {{kind:'sent'|'retry'|'dead', error?:string, retryAfterMs?:number}} outcome
 */
function afterAttempt(row, outcome, now, cfg, rand = Math.random) {
  if (outcome.kind === 'sent') return { status: 'sent', attempts: row.attempts + 1, lastError: null, nextRetryAt: null, sentAt: now };
  if (outcome.kind === 'dead') return { status: 'dead', attempts: row.attempts + 1, lastError: outcome.error || 'rejected by the server', nextRetryAt: null };
  // 'hold': not the row's fault (signed out / token expired, or its SMS attempt is still running). Back to
  // pending without counting an attempt and without backoff growth.
  if (outcome.kind === 'hold') return { status: 'pending', attempts: row.attempts, lastError: outcome.error || row.lastError || null, nextRetryAt: now + (outcome.holdMs || 60000) };

  const attempts = row.attempts + 1;
  const limit = cfg.maxAttempts[row.type];
  if (limit !== null && limit !== undefined && attempts >= limit) {
    return { status: 'failed', attempts, lastError: outcome.error || 'gave up after repeated errors', nextRetryAt: null };
  }
  const delay = Math.max(backoffDelay(attempts, cfg.backoff, rand), outcome.retryAfterMs || 0);
  return { status: 'pending', attempts, lastError: outcome.error || null, nextRetryAt: now + delay };
}

/** Upload order: priority first (SOS ... location points), then oldest first. */
function orderRows(rows, cfg) {
  const prio = (r) => (cfg.priority[r.type] === undefined ? 99 : cfg.priority[r.type]);
  return [...rows].sort((a, b) => prio(a) - prio(b) || a.createdAt - b.createdAt || a.id - b.id);
}

/**
 * The next group of rows to send, or null.
 *
 * - Only 'pending' rows whose nextRetryAt has passed.
 * - If a type's OLDEST pending row is still backing off, the whole type waits (a newer journey update must not
 *   overtake an older one that failed). Other types still go.
 * - Batchable types (location points, geofence events) return up to batchSize[type] rows together.
 * @param {Object} opts { skipTypes?:string[], skipIds?:number[] }  skipped for this pass (e.g. already tried)
 */
function selectNext(rows, now, cfg, { skipTypes = [], skipIds = [] } = {}) {
  const pending = orderRows(rows.filter((r) => r.status === 'pending'), cfg);
  const seenTypes = new Set();
  for (const row of pending) {
    if (skipTypes.includes(row.type) || skipIds.includes(row.id)) {
      seenTypes.add(row.type);
      continue;
    }
    if (seenTypes.has(row.type)) continue; // an older row of this type is blocked (backoff / skipped)
    seenTypes.add(row.type);
    if (row.nextRetryAt !== null && row.nextRetryAt > now) continue; // oldest of its type is still backing off
    const size = cfg.batchSize[row.type];
    if (!size) return [row];
    const group = pending.filter((r) => r.type === row.type && !skipIds.includes(r.id) && (r.nextRetryAt === null || r.nextRetryAt <= now)).slice(0, size);
    return group;
  }
  return null;
}

/** App was killed while sending: every 'sending' row goes back to pending (no attempt is counted). */
function planStartupReset(rows) {
  return rows.filter((r) => r.status === 'sending').map((r) => r.id);
}

/** Same, at runtime, for a request that has been 'sending' longer than any request can take. */
function planStaleSending(rows, now, cfg) {
  return rows.filter((r) => r.status === 'sending' && r.claimedAt !== undefined && r.claimedAt !== null && now - r.claimedAt > cfg.sendingStaleMs).map((r) => r.id);
}

/**
 * Queue cap and age rules, applied before a new row is added (incoming = the new row's type, or null for a plain purge).
 *
 *  1. 'sent' rows older than sentKeepMs go.
 *  2. Rows older than pendingMaxAgeMs go (SOS and SOS cancellations never expire).
 *  3. If live rows (+ the new one) exceed maxRows, rows are dropped in cap.dropOrder, oldest first
 *     (location points first, then geofence events, community reports, journey updates). Rows in flight stay.
 *  4. SOS rows are NEVER dropped. If the queue is still over the cap after step 3 (only SOS rows left) a new
 *     non-SOS row is refused (`rejectIncoming`), while a new SOS row is always accepted.
 */
function planCap(rows, incomingType, now, cfg) {
  const cap = cfg.cap;
  const drop = new Set();
  const reasons = {};

  for (const r of rows) {
    if (r.status === 'sent' && now - (r.sentAt || r.createdAt) > cap.sentKeepMs) {
      drop.add(r.id);
      reasons[r.id] = 'sent_expired';
    } else if (r.status !== 'sent' && !isProtected(r.type) && now - r.createdAt > cap.pendingMaxAgeMs) {
      drop.add(r.id);
      reasons[r.id] = 'too_old';
    }
  }

  const live = rows.filter((r) => isLive(r) && !drop.has(r.id));
  let excess = live.length + (incomingType ? 1 : 0) - cap.maxRows;
  if (excess > 0) {
    for (const type of cap.dropOrder) {
      if (excess <= 0) break;
      const candidates = live.filter((r) => r.type === type && r.status !== 'sending' && !drop.has(r.id)).sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
      for (const r of candidates) {
        if (excess <= 0) break;
        drop.add(r.id);
        reasons[r.id] = 'queue_full';
        excess -= 1;
      }
    }
  }

  const rejectIncoming = excess > 0 && incomingType && !isProtected(incomingType);
  return { drop: [...drop], reasons, rejectIncoming: Boolean(rejectIncoming), overCapAccepted: excess > 0 && Boolean(incomingType) && isProtected(incomingType) };
}

/**
 * What cancelling a queued SOS means, depending on how far it got:
 *   remove         not sent yet: delete the row, nothing reached the server
 *   flag           a request is in flight: mark cancelRequested; when it completes, cancel on the server
 *   cancel_server  already delivered: cancel it on the server (queue a 'sos_cancel' if offline)
 */
function planCancel(row) {
  if (!row) return 'none';
  if (row.status === 'sending') return 'flag';
  if (row.status === 'sent') return row.payload && row.payload.serverId ? 'cancel_server' : 'none';
  return 'remove';
}

/** Counts for the Home / Settings status line. */
function summarize(rows) {
  const out = { pending: 0, sending: 0, failed: 0, dead: 0, sent: 0, live: 0, sosLive: 0, oldestPendingAt: null, byType: {} };
  for (const r of rows) {
    out[r.status] = (out[r.status] || 0) + 1;
    if (isLive(r)) {
      out.live += 1;
      out.byType[r.type] = (out.byType[r.type] || 0) + 1;
      if (r.type === 'sos' && r.status !== 'dead') out.sosLive += 1;
      if (r.status === 'pending' || r.status === 'sending') out.oldestPendingAt = out.oldestPendingAt === null ? r.createdAt : Math.min(out.oldestPendingAt, r.createdAt);
    }
  }
  out.waiting = out.pending + out.sending + out.failed; // what the user sees as "waiting to upload"
  return out;
}

module.exports = {
  PROTECTED_TYPES,
  isProtected,
  backoffDelay,
  classifyResult,
  afterAttempt,
  orderRows,
  selectNext,
  planStartupReset,
  planStaleSending,
  planCap,
  planCancel,
  summarize,
};
