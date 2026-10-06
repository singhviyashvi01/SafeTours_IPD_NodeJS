import * as Crypto from 'expo-crypto';
import { getDb } from './db';
import { session } from '../services/session';
import { createOutboxStore } from '../offline/outboxStoreCore';
import { uuidv4 } from '../offline/uuid';
import { outbox as cfg } from '../offline/offlineConfig';

/**
 * The phone's outbox (SQLite, shared database). Thin binding of offline/outboxStoreCore.js (which holds the
 * logic and the unit tests) to expo-sqlite and expo-crypto.
 *
 * Every idempotency key is a UUID v4 made ONCE here (secure random bytes from expo-crypto) when the row is
 * created and kept for every retry.
 */
export const newIdempotencyKey = () => {
  try {
    return uuidv4(() => Crypto.getRandomBytes(16));
  } catch (e) {
    return uuidv4(); // Math.random fallback: unique enough for an idempotency key
  }
};

let storePromise = null;
const ready = () => {
  if (!storePromise) {
    storePromise = getDb().then((db) => createOutboxStore({ db, cfg, uuid: newIdempotencyKey }));
    storePromise.catch(() => {
      storePromise = null; // retry opening next time
    });
  }
  return storePromise;
};

const call = (name) => async (...args) => (await ready())[name](...args);

// Rows the queue cap has evicted since the app started (oldest location points first), and refused non-SOS rows.
// Shown in Settings so the user can see that the cap was hit.
const capStats = { dropped: 0, refused: 0 };
export const getCapStats = () => ({ ...capStats });

export const outboxStore = {
  /** Never throws: { ok:false, reason:'storage_unavailable' } when SQLite cannot be opened. */
  async enqueue(item) {
    try {
      const owner = session.get();
      const tagged = owner && item.payload && item.payload._owner === undefined ? { ...item, payload: { ...item.payload, _owner: owner } } : item;
      const res = await (await ready()).enqueue(tagged);
      capStats.dropped += res.dropped || 0;
      if (res.reason === 'queue_full') capStats.refused += 1;
      if (res.dropped) console.warn(`[outbox] queue full: dropped ${res.dropped} oldest row(s) to make room`);
      return res;
    } catch (e) {
      console.warn('[outbox] enqueue failed:', e.message);
      return { ok: false, reason: 'storage_unavailable', dropped: 0 };
    }
  },
  get: call('get'),
  getByKey: call('getByKey'),
  list: call('list'),
  claimNext: call('claimNext'),
  applyOutcome: call('applyOutcome'),
  updatePayload: call('updatePayload'),
  resetStuck: call('resetStuck'),
  retry: call('retry'),
  discard: call('discard'),
  clearSent: call('clearSent'),
  purge: call('purge'),
  summary: call('summary'),
};
