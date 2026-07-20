const Incident = require('../models/Incident');
const gridCellService = require('../services/community/gridCell.service');
const logger = require('../utils/logger');

/**
 * Scan the database for active incidents that have passed their expiration date,
 * mark them as EXPIRED, and recalculate scores for all affected H3 cells.
 */
async function checkAndExpireIncidents() {
  try {
    const now = new Date();

    // 1. Find all active incidents that are past their expiry date
    const expiredIncidents = await Incident.find({
      status: 'ACTIVE',
      expiresAt: { $lte: now },
    });

    if (expiredIncidents.length === 0) {
      return;
    }

    const expiredIds = expiredIncidents.map((incident) => incident._id);
    logger.info(`[communityExpiryJob] Found ${expiredIncidents.length} incidents to expire: [${expiredIds.join(', ')}]`);

    // 2. Mark them as EXPIRED in the database
    const result = await Incident.updateMany(
      { _id: { $in: expiredIds } },
      { $set: { status: 'EXPIRED' } }
    );

    logger.info(`[communityExpiryJob] Marked ${result.modifiedCount} incidents as EXPIRED.`);

    // 3. Get unique H3 cell IDs that need their scores updated
    const uniqueH3Cells = [...new Set(expiredIncidents.map((incident) => incident.h3CellId))];
    logger.info(`[communityExpiryJob] Recalculating scores for ${uniqueH3Cells.length} affected H3 cells...`);

    // 4. Recalculate grid cell scores for all unique H3 cells
    for (const h3CellId of uniqueH3Cells) {
      try {
        await gridCellService.recalculateGridCellScore(h3CellId);
      } catch (err) {
        logger.error(`[communityExpiryJob] Failed to recalculate score for H3 cell ${h3CellId} during expiry check:`, err);
      }
    }

    logger.info('[communityExpiryJob] Expiry check and recalculation process completed successfully.');
  } catch (error) {
    logger.error('[communityExpiryJob] Error in background incident expiry check:', error);
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
