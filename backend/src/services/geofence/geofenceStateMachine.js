const defaultCfg = require('../../config/geofence.config');
const riskCfg = require('../../config/risk.config');

/**
 * Geofence state machine (pure; the state is persisted in UserGeofenceState by the service so a
 * restart never resets the dwell / hysteresis counters).
 *
 *   SAFE ──danger reading──▶ ENTERING ──N readings or dwell──▶ IN_DANGER ──non-danger──▶ EXITING ──M readings or dwell──▶ SAFE
 *                               │ non-danger reading resets             │ danger reading resets
 *                               ▼                                       ▼
 *                             SAFE                                  IN_DANGER
 *
 * "danger" depends on the phase (hysteresis): to start, score >= enterScore; once inside, only a score
 * below exitScore (or no data) counts as leaving. UNKNOWN (null score) is never danger: no data is not danger.
 */

const IN_DANGER_PHASES = new Set(['IN_DANGER', 'EXITING']);

function initialState() {
  return {
    phase: 'SAFE',
    dangerReadings: 0,
    dangerSince: null,
    safeReadings: 0,
    safeSince: null,
    lastReadingAt: null,
    currentH3: null,
    lastLevel: null,
    lastScore: null,
    lastEvent: 'NONE',
    episodePrompted: false,
    cooldownCell: null,
    cooldownUntil: null,
  };
}

const isInside = (state) => IN_DANGER_PHASES.has(state.phase);

function isDangerReading(phase, score, cfg) {
  if (score === null || score === undefined || Number.isNaN(score)) return false; // UNKNOWN is never danger
  return IN_DANGER_PHASES.has(phase) ? score >= cfg.exitScore : score >= cfg.enterScore;
}

function dwellReached(count, since, t, needed, dwellSeconds, cfg) {
  if (count >= needed) return true;
  return count >= cfg.minReadingsForDwell && since !== null && t - since >= dwellSeconds * 1000;
}

const levelLabel = (level) => (level ? level.charAt(0) + level.slice(1).toLowerCase() : 'unknown');

/**
 * @param {Object} state
 * @param {{h3Index:string, riskLevel:string, totalRisk:number|null, timestamp:number}} obs
 * @returns {{state:Object, event:string, message:string, progress:Object}}
 */
function step(state, obs, cfg = defaultCfg) {
  const t = obs.timestamp;
  const s = {
    ...state,
    currentH3: obs.h3Index,
    lastScore: obs.totalRisk === undefined ? null : obs.totalRisk,
    lastReadingAt: t,
  };
  const previousLevel = state.lastLevel;
  s.lastLevel = obs.riskLevel;

  let event = 'NO_CHANGE';
  let message = '';
  const danger = isDangerReading(state.phase, s.lastScore, cfg);

  switch (state.phase) {
    case 'SAFE':
      if (danger) {
        s.phase = 'ENTERING';
        s.dangerReadings = 1;
        s.dangerSince = t;
      }
      break;

    case 'ENTERING':
      if (danger) {
        s.dangerReadings = state.dangerReadings + 1;
      } else {
        s.phase = 'SAFE';
        s.dangerReadings = 0;
        s.dangerSince = null;
      }
      break;

    case 'IN_DANGER':
      if (danger) {
        s.safeReadings = 0;
        s.safeSince = null;
        if (previousLevel && previousLevel !== obs.riskLevel) {
          event = 'ZONE_CHANGED';
          message = `Risk level here is now ${levelLabel(obs.riskLevel)}`;
        }
      } else {
        s.phase = 'EXITING';
        s.safeReadings = 1;
        s.safeSince = t;
      }
      break;

    case 'EXITING':
      if (danger) {
        s.phase = 'IN_DANGER';
        s.safeReadings = 0;
        s.safeSince = null;
      } else {
        s.safeReadings = state.safeReadings + 1;
      }
      break;

    default:
      throw new Error(`Unknown geofence phase ${state.phase}`);
  }

  // Promotions are evaluated after the counters above so a single reading can complete them.
  if (s.phase === 'ENTERING' && dwellReached(s.dangerReadings, s.dangerSince, t, cfg.enterReadings, cfg.enterDwellSeconds, cfg)) {
    s.phase = 'IN_DANGER';
    s.dangerReadings = 0;
    s.dangerSince = null;
    s.safeReadings = 0;
    s.safeSince = null;
    s.episodePrompted = false;
    event = 'ENTER';
    message = `Entering ${levelLabel(obs.riskLevel)} risk area`;
  } else if (s.phase === 'EXITING' && dwellReached(s.safeReadings, s.safeSince, t, cfg.exitReadings, cfg.exitDwellSeconds, cfg)) {
    s.phase = 'SAFE';
    s.safeReadings = 0;
    s.safeSince = null;
    s.dangerReadings = 0;
    s.dangerSince = null;
    s.episodePrompted = false;
    event = 'EXIT';
    message = 'Left the risk area';
  }

  s.lastEvent = event;
  return { state: s, event, message, progress: progressOf(s, t, cfg) };
}

function progressOf(s, t, cfg = defaultCfg) {
  return {
    enter:
      s.phase === 'ENTERING'
        ? {
            readings: s.dangerReadings,
            neededReadings: cfg.enterReadings,
            elapsedSeconds: Math.round((t - s.dangerSince) / 1000),
            neededSeconds: cfg.enterDwellSeconds,
          }
        : null,
    exit:
      s.phase === 'EXITING'
        ? {
            readings: s.safeReadings,
            neededReadings: cfg.exitReadings,
            elapsedSeconds: Math.round((t - s.safeSince) / 1000),
            neededSeconds: cfg.exitDwellSeconds,
          }
        : null,
  };
}

/** True for levels that count as danger in risk.config.js (HIGH, EXTREME). */
const isDangerLevel = (level) => riskCfg.dangerLevels.includes(level);

module.exports = { initialState, step, isInside, isDangerReading, progressOf, isDangerLevel };
