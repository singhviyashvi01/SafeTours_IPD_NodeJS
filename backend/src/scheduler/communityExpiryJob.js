const Incident = require('../models/Incident');
const communityComponent = require('../services/risk/communityComponent');
const feedStatus = require('../services/risk/feedStatus.service');
const logger = require('../utils/logger');

/**
 * Scan the database for active incidents that have passed their expiration date,
 * mark them as EXPIRED, and recalculate scores for all affected H3 cells.
 */
async function checkAndExpireIncidents() {
  try {
    const now = new Date();

    // 1. Mark incidents past their TTL as EXPIRED.
    const result = await Incident.updateMany(
      { status: 'ACTIVE', expiresAt: { $lte: now } },
      { $set: { status: 'EXPIRED' } }
    );
    if (result.modifiedCount > 0) {
      logger.info(`[communityExpiryJob] Marked ${result.modifiedCount} incidents as EXPIRED.`);
    }

    // 2. Recompute every community score (incidents also decay with time, not just on expiry)
    //    and record the feed heartbeat used by the risk engine.
    await communityComponent.sweepAll();
  } catch (error) {
    logger.error('[communityExpiryJob] Error in background community sweep:', error);
    await feedStatus.markFailure('community', error);
  }
}

/**
 * Initializes and starts the background scheduler.
 *
 * @param {number} [intervalMs=300000] - Interval time in milliseconds (default 5 minutes).
 * @returns {Object} The interval timer reference.
 */
function startExpiryScheduler(intervalMs = 5 * 60 * 1000) {
  logger.info(`[communityExpiryJob] Initializing background incident expiry scheduler (Interval: ${intervalMs / 1000}s)...`);

  // Run a check immediately on server startup
  checkAndExpireIncidents();

  // Set up recurring timer
  const intervalId = setInterval(async () => {
    await checkAndExpireIncidents();
  }, intervalMs);

  return intervalId;
}

module.exports = {
  checkAndExpireIncidents,
  startExpiryScheduler,
};
