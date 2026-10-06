const defaultCfg = require('../../config/geofence.config');
const core = require('../../shared/deviceCore');

/**
 * Processes GPS readings (one live reading or an offline batch) through the state machine, oldest first.
 * Server-side binding of shared/deviceCore.js processReadings (the phone runs the same code offline).
 * Pure apart from the injected `resolveRisk`.
 */
function processReadings(state, readings, { resolveRisk, now = new Date(), cfg = defaultCfg }) {
  return core.processReadings(state, readings, { resolveRisk, now, cfg });
}

module.exports = { processReadings };
