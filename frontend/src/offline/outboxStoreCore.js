'use strict';

const logic = require('./outboxLogic');
const { uuidv4 } = require('./uuid');

/**
 * The outbox on SQLite, written against a tiny async driver so the SAME code runs on the phone (expo-sqlite)
 * and in the unit tests (node:sqlite):
 *   db.runAsync(sql, ...params)      -> { changes, lastInsertRowId }
 *   db.getAllAsync(sql, ...params)   -> rows
 *   db.getFirstAsync(sql, ...params) -> row | null
 */
const OUTBOX_SCHEMA = `
  CREATE TABLE IF NOT EXISTS outbox (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    type            TEXT NOT NULL,
    payload         TEXT NOT NULL,
    idempotency_key TEXT NOT NULL UNIQUE,
    created_at      INTEGER NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_retry_at   INTEGER,
    status          TEXT NOT NULL DEFAULT 'pending',
    last_error      TEXT,
    claimed_at      INTEGER,
    sent_at         INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox (status, type, created_at);
`;

const TYPES = ['sos', 'sos_cancel', 'journey_update', 'geofence_event', 'community_report', 'location_point'];

const toRow = (r) => ({
  id: r.id,
  type: r.type,
  payload: JSON.parse(r.payload),
  idempotencyKey: r.idempotency_key,
  createdAt: r.created_at,
  attempts: r.attempts,
  nextRetryAt: r.next_retry_at,
  status: r.status,
  lastError: r.last_error,
  claimedAt: r.claimed_at,
  sentAt: r.sent_at,
});

const isUniqueViolation = (e) => /UNIQUE|constraint/i.test((e && e.message) || '');

/**
 * @param {{db:Object, cfg:Object, now?:()=>number, uuid?:()=>string, rand?:()=>number}} deps  cfg = offlineConfig.outbox
 */
function createOutboxStore({ db, cfg, now = () => Date.now(), uuid = uuidv4, rand = Math.random }) {
  const store = {
    /**
     * Adds a row. The idempotencyKey is made HERE, once, and never changes; passing a key that already exists
     * returns the existing row (`duplicate:true`) instead of a second one.
     * @returns {Promise<{ok:boolean, row?:Object, duplicate?:boolean, dropped:number, overCap?:boolean, reason?:string}>}
     */
    async enqueue({ type, payload, idempotencyKey, createdAt }) {
      if (!TYPES.includes(type)) throw new Error(`unknown outbox type: ${type}`);
      const key = idempotencyKey || uuid();
      const existing = await store.getByKey(key);
      if (existing) return { ok: true, row: existing, duplicate: true, dropped: 0 };

      const t = now();
      const light = await db.getAllAsync('SELECT id, type, status, created_at, sent_at, claimed_at FROM outbox');
      const plan = logic.planCap(
        light.map((r) => ({ id: r.id, type: r.type, status: r.status, createdAt: r.created_at, sentAt: r.sent_at, claimedAt: r.claimed_at })),
        type,
        t,
        cfg
      );
      for (const id of plan.drop) await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
      if (plan.rejectIncoming) return { ok: false, reason: 'queue_full', dropped: plan.drop.length };

      try {
        const res = await db.runAsync(
          'INSERT INTO outbox (type, payload, idempotency_key, created_at, status) VALUES (?, ?, ?, ?, ?)',
          type, JSON.stringify(payload || {}), key, createdAt || t, 'pending'
        );
        const id = res.lastInsertRowId !== undefined ? res.lastInsertRowId : res.lastInsertRowid;
        return { ok: true, row: await store.get(Number(id)), duplicate: false, dropped: plan.drop.length, overCap: plan.overCapAccepted };
      } catch (e) {
        if (isUniqueViolation(e)) return { ok: true, row: await store.getByKey(key), duplicate: true, dropped: plan.drop.length };
        throw e;
      }
    },

    async get(id) {
      const r = await db.getFirstAsync('SELECT * FROM outbox WHERE id = ?', id);
      return r ? toRow(r) : null;
    },

    async getByKey(key) {
      const r = await db.getFirstAsync('SELECT * FROM outbox WHERE idempotency_key = ?', key);
      return r ? toRow(r) : null;
    },

    /** Rows, oldest first. opts: { statuses?:string[], types?:string[], limit?:number } */
    async list({ statuses, types, limit = 500 } = {}) {
      const where = [];
      const params = [];
      if (statuses && statuses.length) { where.push(`status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
      if (types && types.length) { where.push(`type IN (${types.map(() => '?').join(',')})`); params.push(...types); }
      const rows = await db.getAllAsync(`SELECT * FROM outbox ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at ASC, id ASC LIMIT ?`, ...params, limit);
      return rows.map(toRow);
    },

    /** The next group of rows to send (see outboxLogic.selectNext), already marked 'sending', or null. */
    async claimNext(opts = {}) {
      const t = now();
      const pending = await store.list({ statuses: ['pending'], limit: 5000 });
      const group = logic.selectNext(pending, t, cfg, opts);
      if (!group || group.length === 0) return null;
      for (const r of group) await db.runAsync("UPDATE outbox SET status = 'sending', claimed_at = ? WHERE id = ? AND status = 'pending'", t, r.id);
      return group.map((r) => ({ ...r, status: 'sending', claimedAt: t }));
    },

    /** Records the result of one attempt (see outboxLogic.afterAttempt). */
    async applyOutcome(id, outcome) {
      const row = await store.get(id);
      if (!row) return null;
      const patch = logic.afterAttempt(row, outcome, now(), cfg, rand);
      await db.runAsync(
        'UPDATE outbox SET status = ?, attempts = ?, last_error = ?, next_retry_at = ?, sent_at = COALESCE(?, sent_at), claimed_at = NULL WHERE id = ?',
        patch.status, patch.attempts, patch.lastError === undefined ? null : patch.lastError, patch.nextRetryAt === undefined ? null : patch.nextRetryAt, patch.sentAt === undefined ? null : patch.sentAt, id
      );
      return { ...row, ...patch };
    },

    /** Merges fields into a row's payload (e.g. the SMS outcome, the server id). */
    async updatePayload(id, patch) {
      const row = await store.get(id);
      if (!row) return null;
      const next = { ...row.payload, ...patch };
      await db.runAsync('UPDATE outbox SET payload = ? WHERE id = ?', JSON.stringify(next), id);
      return { ...row, payload: next };
    },

    /** 'sending' -> 'pending' for rows left behind by a killed app (startup) or a hung request (runtime). */
    async resetStuck({ startup = false } = {}) {
      const rows = await db.getAllAsync("SELECT id, type, status, claimed_at FROM outbox WHERE status = 'sending'");
      const ids = startup
        ? logic.planStartupReset(rows.map((r) => ({ id: r.id, status: r.status })))
        : logic.planStaleSending(rows.map((r) => ({ id: r.id, status: r.status, claimedAt: r.claimed_at })), now(), cfg);
      for (const id of ids) await db.runAsync("UPDATE outbox SET status = 'pending', claimed_at = NULL WHERE id = ?", id);
      return ids.length;
    },

    /** User pressed "Retry" on a failed or dead row. */
    async retry(id) {
      const res = await db.runAsync("UPDATE outbox SET status = 'pending', attempts = 0, next_retry_at = NULL, last_error = NULL, claimed_at = NULL WHERE id = ? AND status IN ('failed','dead')", id);
      return res.changes > 0;
    },

    async discard(id) {
      const res = await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
      return res.changes > 0;
    },

    async clearSent() {
      const res = await db.runAsync("DELETE FROM outbox WHERE status = 'sent'");
      return res.changes;
    },

    /** Applies the age rules (no new row). Returns how many rows were dropped. */
    async purge() {
      const light = await db.getAllAsync('SELECT id, type, status, created_at, sent_at, claimed_at FROM outbox');
      const plan = logic.planCap(light.map((r) => ({ id: r.id, type: r.type, status: r.status, createdAt: r.created_at, sentAt: r.sent_at, claimedAt: r.claimed_at })), null, now(), cfg);
      for (const id of plan.drop) await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
      return plan.drop.length;
    },

    async summary() {
      const rows = await db.getAllAsync('SELECT id, type, status, created_at FROM outbox');
      return logic.summarize(rows.map((r) => ({ id: r.id, type: r.type, status: r.status, createdAt: r.created_at })));
    },
  };
  return store;
}

module.exports = { OUTBOX_SCHEMA, TYPES, createOutboxStore };
