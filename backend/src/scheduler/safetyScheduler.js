const sosService = require('../services/sosService');
const journeyService = require('../services/journeyService');
const cfg = require('../config/geofence.config');
const logger = require('../utils/logger');

/**
 * Safety scheduler: the single poller behind the cancellable auto-SOS and Shadow Mode.
 *
 * Every few seconds it
 *   1. creates "Are you okay?" checks for journeys whose ETA has passed, and
 *   2. escalates pending safety checks whose confirmBy deadline has passed.
 *
 * There are no in-memory timers: every deadline is a field in MongoDB (SOSHistory.confirmBy,
 * Journey.expectedArrivalTime), so a restart simply resumes. Anything overdue while the server was down
 * is handled on the first tick (a journey ETA that passed during downtime gets a fresh countdown;
 * a check whose deadline passed is escalated).
 */
let running = false;

async function tick() {
  if (running) return; // never overlap
  running = true;
  try {
    const eta = await journeyService.processEtaDue();
    const sos = await sosService.processDue();
    if (eta.created || sos.escalated || sos.autoResolved) {
      logger.info(`[safetyScheduler] eta checks created: ${eta.created}, escalated: ${sos.escalated}, auto-resolved: ${sos.autoResolved}`);
    }
  } catch (error) {
    logger.error('[safetyScheduler] tick failed', error);
  } finally {
    running = false;
  }
}

function startSafetyScheduler(intervalMs = cfg.sos.pollSeconds * 1000) {
  logger.info(`[safetyScheduler] Starting (poll every ${intervalMs / 1000}s). Deadlines are persisted in MongoDB.`);
  tick(); // re-arm immediately after a restart
  return setInterval(tick, intervalMs);
}

module.exports = { tick, startSafetyScheduler };
