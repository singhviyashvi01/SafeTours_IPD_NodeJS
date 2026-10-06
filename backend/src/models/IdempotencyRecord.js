const mongoose = require('mongoose');

/**
 * IdempotencyRecord: remembers the response of a mutating request that carried an Idempotency-Key, so the
 * offline outbox can safely re-send it (lost response, killed app, retry) without creating a second record.
 *
 *   state 'pending'  the first request is still running (or crashed): a duplicate gets 503 + Retry-After
 *   state 'done'     the first request finished with a 2xx: a duplicate gets the stored response
 *
 * Failed requests (non-2xx) delete their record, so a corrected retry can run. Records expire after 7 days.
 * Indexes (unique key + TTL) are created by `npm run create:indexes` or by Mongoose on first start.
 */
const idempotencyRecordSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  scope: { type: String, required: true }, // e.g. "POST community.report"
  key: { type: String, required: true },
  state: { type: String, enum: ['pending', 'done'], default: 'pending' },
  statusCode: { type: Number, default: null },
  response: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now, expires: 7 * 24 * 3600 },
});

idempotencyRecordSchema.index({ user: 1, scope: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('IdempotencyRecord', idempotencyRecordSchema);
