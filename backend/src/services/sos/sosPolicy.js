const h3 = require('h3-js');
const defaultCfg = require('../../config/geofence.config');

/**
 * SOS decision rules (pure). The service applies them; they are separate so they can be tested
 * without a database.
 */

/** True while a recent cancel is still suppressing geofence prompts around the user's current cell. */
function cooldownActive(state, now = new Date(), cfg = defaultCfg) {
  if (!state.cooldownCell || !state.cooldownUntil || !state.currentH3) return false;
  if (new Date(state.cooldownUntil).getTime() <= now.getTime()) return false;
  try {
    return h3.gridDisk(state.cooldownCell, cfg.sos.cooldownRing).includes(state.currentH3);
  } catch (e) {
    return false;
  }
}

/**
 * Should a geofence "Are you safe?" check be created for the user's current state?
 *
 *  create        start a pending-confirmation SOS now
 *  markHandled   remember that this danger episode has been dealt with (no re-evaluation, no spam)
 *  reason        why not / why
 *
 * A stale last reading (older than historicalAfterMinutes) never prompts and is NOT marked handled, so
 * a later fresh reading in the same episode can still prompt.
 */
function evaluatePrompt({ state, now = new Date(), autoSosEnabled, hasActiveOrPending, cfg = defaultCfg }) {
  if (state.phase !== 'IN_DANGER') return { create: false, markHandled: false, reason: 'not-in-danger' };
  if (state.episodePrompted) return { create: false, markHandled: false, reason: 'already-handled' };

  const ageMs = now.getTime() - (state.lastReadingAt ?? 0);
  if (state.lastReadingAt === null || ageMs > cfg.historicalAfterMinutes * 60000) {
    return { create: false, markHandled: false, reason: 'stale-reading' };
  }
  if (!autoSosEnabled) return { create: false, markHandled: true, reason: 'auto-sos-disabled' };
  if (hasActiveOrPending) return { create: false, markHandled: true, reason: 'duplicate-suppressed' };
  if (cooldownActive(state, now, cfg)) return { create: false, markHandled: true, reason: 'cooldown' };
  return { create: true, markHandled: true, reason: 'ok' };
}

const confirmDeadline = (now, seconds) => new Date(now.getTime() + seconds * 1000);

/** 'waiting' until the confirmation deadline, 'expired' from then on. */
function pendingStatus(record, now = new Date()) {
  return new Date(record.confirmBy).getTime() <= now.getTime() ? 'expired' : 'waiting';
}

const secondsLeft = (record, now = new Date()) =>
  Math.max(0, Math.ceil((new Date(record.confirmBy).getTime() - now.getTime()) / 1000));

module.exports = { cooldownActive, evaluatePrompt, confirmDeadline, pendingStatus, secondsLeft };
