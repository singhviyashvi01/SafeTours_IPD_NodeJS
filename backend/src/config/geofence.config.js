const riskCfg = require('./risk.config');

/**
 * geofence.config.js: every threshold of geofence detection, the cancellable auto-SOS flow and
 * Shadow Mode ETA enforcement. Each value can be overridden with the environment variable shown.
 */
const num = (name, fallback) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
};

// Default enter threshold = the lowest score of a danger level (HIGH) in risk.config.js.
const highMin = riskCfg.thresholds.find((t) => riskCfg.dangerLevels.includes(t.level)).min;

module.exports = {
  // GPS readings less accurate than this are ignored (no state change, status LOW_ACCURACY).
  accuracyMaxMeters: num('GEOFENCE_MAX_ACCURACY_M', 50),

  // Hysteresis: a cell is "danger" to ENTER at >= enterScore, but the user only counts as having left
  // when the score drops BELOW exitScore (lower than enterScore) or the cell has no data (UNKNOWN).
  // A reading between exitScore and enterScore changes nothing, so users on a border do not flap.
  enterScore: num('GEOFENCE_ENTER_SCORE', highMin),
  exitScore: num('GEOFENCE_EXIT_SCORE', highMin - 8),

  // ENTER fires after N consecutive in-danger readings, OR after enterDwellSeconds of continuous
  // in-danger readings (needs at least minReadingsForDwell so one stale reading cannot qualify).
  enterReadings: num('GEOFENCE_ENTER_READINGS', 3),
  enterDwellSeconds: num('GEOFENCE_ENTER_DWELL_S', 60),
  // EXIT after M consecutive non-danger readings OR exitDwellSeconds.
  exitReadings: num('GEOFENCE_EXIT_READINGS', 3),
  exitDwellSeconds: num('GEOFENCE_EXIT_DWELL_S', 90),
  minReadingsForDwell: 2,

  // Events older than this at processing time are stored as history and never start an SOS prompt.
  historicalAfterMinutes: num('GEOFENCE_HISTORICAL_MIN', 10),
  // Readings stamped further in the future than this are rejected (bad device clock).
  futureToleranceSeconds: 60,

  // /geofence/sync limits
  syncMaxPoints: 500,

  sos: {
    // Seconds the user has to answer "Are you safe?" before the server escalates.
    confirmSeconds: num('SOS_CONFIRM_SECONDS', 60),
    // After the user cancels a geofence check, no new geofence prompt for this long, within
    // cooldownRing H3 rings (~175 m each) of the cell where it was cancelled.
    cooldownMinutes: num('SOS_COOLDOWN_MIN', 30),
    cooldownRing: num('SOS_COOLDOWN_RING', 2),
    // How often the persisted-deadline poller looks for expired confirmations / passed ETAs.
    pollSeconds: num('SOS_POLL_SECONDS', 5),
    // An active SOS older than this is closed automatically so it cannot block new SOS forever.
    activeMaxHours: num('SOS_ACTIVE_MAX_HOURS', 12),
  },

  eta: {
    // Journey counts as arrived within this distance of the destination (with accuracy <= accuracyMaxMeters).
    arrivalRadiusMeters: num('JOURNEY_ARRIVAL_RADIUS_M', 100),
    // "I'm okay" after an ETA prompt pushes the ETA out by this many minutes unless the client sends one.
    defaultExtendMinutes: num('JOURNEY_ETA_EXTEND_MIN', 15),
    maxExtendMinutes: 240,
  },
};
