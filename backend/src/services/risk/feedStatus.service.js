const FeedStatus = require('../../models/FeedStatus');
const logger = require('../../utils/logger');

const CACHE_TTL_MS = 20 * 1000;
let cache = { at: 0, value: {} };

/** Records a successful run of a feed. Only a success moves `updatedAt`. */
async function markSuccess(key, stats) {
  const now = new Date();
  await FeedStatus.updateOne(
    { key },
    { $set: { updatedAt: now, lastAttemptAt: now, lastError: null, ...(stats ? { stats } : {}) } },
    { upsert: true }
  );
  cache.at = 0;
}

/** Records a failed run. `updatedAt` is left alone so the data ages and is flagged stale. */
async function markFailure(key, error) {
  const message = error && error.message ? error.message : String(error);
  logger.warn(`[feed:${key}] run failed: ${message}`);
  try {
    await FeedStatus.updateOne(
      { key },
      { $set: { lastAttemptAt: new Date(), lastError: message.slice(0, 300) } },
      { upsert: true }
    );
    cache.at = 0;
  } catch (e) {
    logger.error(`[feed:${key}] could not record failure`, e);
  }
}

/** Removes a feed's record (e.g. when demo data is switched off). */
async function clear(key) {
  await FeedStatus.deleteOne({ key });
  cache.at = 0;
}

/** { key: { updatedAt, lastAttemptAt, lastError, stats } } — cached for a few seconds. */
async function getAll({ fresh = false } = {}) {
  if (!fresh && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const docs = await FeedStatus.find({}).lean();
  const value = {};
  for (const d of docs) value[d.key] = d;
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { markSuccess, markFailure, clear, getAll };
