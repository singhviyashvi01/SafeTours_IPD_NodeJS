import { AppState } from 'react-native';
import { outboxStore } from '../storage/outboxStore';
import { deviceLogStore } from '../storage/deviceLogStore';
import { connectivityStore } from '../connectivity/connectivityStore';
import { sendGroup } from './outboxUploaders';
import { outbox as cfg } from '../offline/offlineConfig';

/**
 * The outbox runner: uploads what is waiting, in order, with backoff.
 *
 * When it runs
 *   - the connectivity state turns ONLINE
 *   - the app returns to the foreground
 *   - every drainIntervalMs while ONLINE (while WEAK only SOS rows are tried: a struggling link should not be
 *     loaded with location batches, but an SOS must keep trying)
 *   - right after something is queued (kick)
 * It never runs while OFFLINE (including the forced "Offline mode" switch).
 *
 * One drain at a time. Order: SOS, SOS cancellations, journey updates, geofence events, community reports,
 * location points; oldest first inside a type (see offline/outboxLogic.js). A type that just failed is skipped for
 * the rest of the pass so a struggling server is not hammered.
 */
const META_KEY = 'outbox';
const SOS_TYPES = ['sos', 'sos_cancel'];
const ALL_TYPES = Object.keys(cfg.priority);

let started = false;
let running = false;
let rerun = null; // options for one more pass requested while running
let timer = null;
let kickTimer = null;
let summary = { pending: 0, sending: 0, failed: 0, dead: 0, sent: 0, live: 0, sosLive: 0, waiting: 0, oldestPendingAt: null, byType: {} };
let lastSyncAt = null;
let lastRunAt = null;
const listeners = new Set();
const sentHooks = new Set();

const snapshot = () => ({ ...summary, lastSyncAt, lastRunAt, running });
const emit = () => listeners.forEach((fn) => { try { fn(snapshot()); } catch (e) { /* listener bug */ } });

async function refresh() {
  try {
    summary = await outboxStore.summary();
  } catch (e) {
    /* SQLite unavailable: keep the last numbers */
  }
  emit();
}

const state = () => connectivityStore.getState().state;

/**
 * @param {{onlyTypes?:string[]}} [opts]
 * @returns {Promise<{sent:number, retried:number, dead:number}>}
 */
async function drain(opts = {}) {
  if (running) {
    rerun = opts;
    return { sent: 0, retried: 0, dead: 0, busy: true };
  }
  const s = state();
  if (s === 'OFFLINE') return { sent: 0, retried: 0, dead: 0, offline: true };
  const onlyTypes = opts.onlyTypes || (s === 'WEAK' ? SOS_TYPES : null);

  running = true;
  lastRunAt = Date.now();
  emit();
  const totals = { sent: 0, retried: 0, dead: 0 };
  try {
    await outboxStore.resetStuck(); // a request hung longer than any request can take
    const skipTypes = onlyTypes ? ALL_TYPES.filter((t) => !onlyTypes.includes(t)) : [];
    for (let guard = 0; guard < 500; guard += 1) {
      if (state() === 'OFFLINE') break; // lost the link mid-pass
      const group = await outboxStore.claimNext({ skipTypes });
      if (!group) break;

      const results = await sendGroup(group);
      let hold = false;
      let transient = false;
      for (const { row, outcome, patch } of results) {
        if (patch) await outboxStore.updatePayload(row.id, patch);
        const after = await outboxStore.applyOutcome(row.id, outcome);
        if (outcome.kind === 'sent') {
          totals.sent += 1;
          await afterSent({ ...row, payload: { ...row.payload, ...(patch || {}) } }, patch);
        } else if (outcome.kind === 'dead') {
          totals.dead += 1;
          console.warn(`[outbox] ${row.type} #${row.id} rejected: ${outcome.error}`);
        } else if (outcome.kind === 'hold') {
          hold = true;
        } else {
          totals.retried += 1;
          transient = true;
          if (after && after.status === 'failed') console.warn(`[outbox] ${row.type} #${row.id} gave up: ${outcome.error}`);
        }
      }
      if (transient) skipTypes.push(group[0].type);
      if (hold && group[0].type !== 'sos') break;
    }
    if (totals.sent > 0) {
      lastSyncAt = Date.now();
      await deviceLogStore.setState(META_KEY, { lastSyncAt });
    }
    await outboxStore.purge();
  } catch (e) {
    console.warn('[outbox] drain failed:', e.message);
  } finally {
    running = false;
    await refresh();
    if (rerun) {
      const next = rerun;
      rerun = null;
      setTimeout(() => drain(next), 0);
    }
  }
  return totals;
}

/** A delivered SOS: cancel it on the server if the user cancelled while it was in flight; tell the listeners. */
async function afterSent(row, patch) {
  if (row.type === 'sos') {
    if (row.payload.cancelRequested && patch && patch.serverId) {
      await outboxStore.enqueue({ type: 'sos_cancel', payload: { sosId: patch.serverId, reason: 'Cancelled by user while the SOS was being delivered' } });
      kick(0);
    }
  }
  sentHooks.forEach((fn) => { try { fn(row, patch); } catch (e) { /* hook bug */ } });
}

/** Ask for a drain soon (debounced), e.g. right after something was queued. */
function kick(delayMs = 400) {
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => drain(), delayMs);
}

let lastState = null;
function onConnectivity(c) {
  const prev = lastState;
  lastState = c.state;
  if (c.state === 'ONLINE' && prev !== 'ONLINE') drain();
  else if (c.state === 'WEAK' && prev === 'OFFLINE') drain({ onlyTypes: SOS_TYPES });
}

export const outboxRunner = {
  /** Call once at startup (after login is not required: rows simply wait for a token). */
  async start() {
    if (started) return;
    started = true;
    try {
      const reset = await outboxStore.resetStuck({ startup: true }); // rows a killed app left in 'sending'
      if (reset) console.log(`[outbox] reset ${reset} row(s) left in "sending" by the previous run`);
      await outboxStore.purge();
      const meta = await deviceLogStore.getState(META_KEY);
      lastSyncAt = meta && meta.lastSyncAt ? meta.lastSyncAt : null;
    } catch (e) {
      console.warn('[outbox] startup failed:', e.message);
    }
    await refresh();

    lastState = state();
    connectivityStore.subscribe(onConnectivity);
    AppState.addEventListener('change', (s) => {
      if (s === 'active') drain();
    });
    timer = setInterval(() => {
      const st = state();
      if (st === 'ONLINE') drain();
      else if (st === 'WEAK') drain({ onlyTypes: SOS_TYPES });
    }, cfg.drainIntervalMs);
    if (lastState !== 'OFFLINE') drain();
  },

  stop() {
    started = false;
    clearInterval(timer);
    clearTimeout(kickTimer);
  },

  drain,
  kick,
  refresh,
  getSummary: snapshot,

  /** Called after each delivered row: (row, patch) */
  onSent(fn) {
    sentHooks.add(fn);
    return () => sentHooks.delete(fn);
  },

  subscribe(fn) {
    listeners.add(fn);
    fn(snapshot());
    return () => listeners.delete(fn);
  },
};
