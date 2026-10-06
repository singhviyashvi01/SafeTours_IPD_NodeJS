/**
 * Idempotency store logic (storage injected, so it is unit-testable without MongoDB).
 *
 *   begin()    -> { action: 'run', id }          first time we see this key: the caller runs the handler
 *              -> { action: 'replay', statusCode, body }   the first request finished: return its response
 *              -> { action: 'in_progress' }      the first request is still running: ask the client to retry
 *   complete() stores the 2xx response; abort() forgets the key (the request failed, a retry may run).
 */
const STALE_PENDING_MS = 60 * 1000; // a 'pending' record older than this belongs to a crashed handler
const MAX_STORED_BYTES = 20000;

const isDuplicateKey = (e) => e && (e.code === 11000 || /E11000/.test(e.message || ''));

function createIdempotency(Model, { now = () => new Date(), stalePendingMs = STALE_PENDING_MS } = {}) {
  return {
    async begin({ user, scope, key }) {
      try {
        const rec = await Model.create({ user, scope, key, state: 'pending', createdAt: now() });
        return { action: 'run', id: rec._id };
      } catch (e) {
        if (!isDuplicateKey(e)) throw e;
      }
      const existing = await Model.findOne({ user, scope, key });
      if (!existing) return this.begin({ user, scope, key }); // deleted in between: try again
      if (existing.state === 'done') return { action: 'replay', statusCode: existing.statusCode || 200, body: existing.response };

      // pending: still running, or its handler died. Take over only when stale.
      const cut = new Date(now().getTime() - stalePendingMs);
      const taken = await Model.findOneAndUpdate(
        { _id: existing._id, state: 'pending', createdAt: { $lte: cut } },
        { $set: { createdAt: now() } }
      );
      return taken ? { action: 'run', id: existing._id } : { action: 'in_progress' };
    },

    async complete(id, statusCode, body) {
      let stored = body;
      try {
        if (JSON.stringify(body).length > MAX_STORED_BYTES) stored = { success: true, replayed: true, message: 'Original response was too large to store.' };
      } catch (e) {
        stored = { success: true, replayed: true };
      }
      await Model.updateOne({ _id: id }, { $set: { state: 'done', statusCode, response: stored } });
    },

    async abort(id) {
      await Model.deleteOne({ _id: id });
    },
  };
}

module.exports = { createIdempotency, STALE_PENDING_MS };
