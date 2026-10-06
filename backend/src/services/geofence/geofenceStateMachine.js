const defaultCfg = require('../../config/geofence.config');
const riskCfg = require('../../config/risk.config');
const core = require('../../shared/deviceCore');

/**
 * Geofence state machine: server-side binding of shared/deviceCore.js (the exact same code runs on the
 * phone for offline checks). The persisted state lives in UserGeofenceState; see deviceCore for the
 * phases and rules:
 *
 *   SAFE -> ENTERING -> IN_DANGER -> EXITING -> SAFE, with dwell (N readings or T seconds) and hysteresis
 *   (enter at >= enterScore, leave only below exitScore). UNKNOWN is never danger.
 */
module.exports = {
  initialState: core.initialState,
  isInside: core.isInside,
  step: (state, obs, cfg = defaultCfg) => core.step(state, obs, cfg),
  isDangerReading: (phase, score, cfg = defaultCfg) => core.isDangerReading(phase, score, cfg),
  progressOf: (s, t, cfg = defaultCfg) => core.progressOf(s, t, cfg),
  /** True for levels that count as danger in risk.config.js (HIGH, EXTREME). */
  isDangerLevel: (level) => riskCfg.dangerLevels.includes(level),
};
