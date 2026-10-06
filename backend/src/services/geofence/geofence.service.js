const UserGeofenceState = require('../../models/UserGeofenceState');
const GeofenceEvent = require('../../models/GeofenceEvent');
const SOSHistory = require('../../models/SOSHistory');
const Journey = require('../../models/Journey');
const User = require('../../models/User');
const cellRisk = require('../risk/cellRisk.service');
const sosService = require('../sosService');
const journeyService = require('../journeyService');
const { initialState, isInside, progressOf } = require('./geofenceStateMachine');
const { processReadings } = require('./geofenceReplay');
const { evaluatePrompt } = require('../sos/sosPolicy');
const cfg = require('../../config/geofence.config');
const ApiError = require('../../utils/apiError');
const logger = require('../../utils/logger');

/**
 * GeofenceService: persistence + orchestration around the pure state machine.
 *
 * Risk comes only from the risk engine (services/risk). The dwell / hysteresis counters live in
 * UserGeofenceState and every write is conditional on lastReadingAt, so a restart loses nothing and two
 * concurrent requests cannot both advance (or both prompt) from the same state.
 *
 * ENTER no longer fires an SOS. It creates a pending "Are you safe?" check (sosService.createSafetyCheck)
 * that the user can cancel; only the deadline escalates it.
 */

const toMs = (d) => (d ? new Date(d).getTime() : null);
const toDate = (ms) => (ms === null || ms === undefined ? null : new Date(ms));

function docToState(doc) {
  return {
    phase: doc.phase || 'SAFE',
    dangerReadings: doc.dangerReadings || 0,
    dangerSince: toMs(doc.dangerSince),
    safeReadings: doc.safeReadings || 0,
    safeSince: toMs(doc.safeSince),
    lastReadingAt: toMs(doc.lastReadingAt),
    currentH3: doc.currentH3 || null,
    lastLevel: doc.lastLevel || null,
    lastScore: doc.lastScore ?? null,
    lastEvent: doc.lastEvent || 'NONE',
    episodePrompted: Boolean(doc.episodePrompted),
    cooldownCell: doc.cooldownCell || null,
    cooldownUntil: doc.cooldownUntil || null,
  };
}

function stateToFields(state, zoneId) {
  return {
    phase: state.phase,
    dangerReadings: state.dangerReadings,
    dangerSince: toDate(state.dangerSince),
    safeReadings: state.safeReadings,
    safeSince: toDate(state.safeSince),
    lastReadingAt: toDate(state.lastReadingAt),
    currentH3: state.currentH3,
    currentZoneId: zoneId || null,
    lastLevel: state.lastLevel,
    lastScore: state.lastScore,
    insideDangerZone: isInside(state),
    lastEvent: state.lastEvent,
    lastChecked: new Date(),
    episodePrompted: state.episodePrompted,
  };
}

async function loadState(userId) {
  const doc = await UserGeofenceState.findOne({ userId }).lean();
  return { exists: Boolean(doc), token: doc ? toMs(doc.lastReadingAt) : null, state: doc ? docToState(doc) : initialState() };
}

/** Conditional write. Returns false when another request changed the state in between. */
async function saveState(userId, loaded, state, zoneId) {
  const fields = stateToFields(state, zoneId);
  if (!loaded.exists) {
    try {
      await UserGeofenceState.create({ userId, ...fields });
      return true;
    } catch (e) {
      if (e && e.code === 11000) return false;
      throw e;
    }
  }
  const updated = await UserGeofenceState.findOneAndUpdate(
    { userId, lastReadingAt: loaded.token === null ? null : new Date(loaded.token) },
    { $set: fields }
  );
  return Boolean(updated);
}

const messageFor = (state, stepMessage) => {
  if (stepMessage) return stepMessage;
  switch (state.phase) {
    case 'ENTERING': return 'Confirming you are in a risk area...';
    case 'IN_DANGER': return `In a ${String(state.lastLevel || 'high').toLowerCase()} risk area`;
    case 'EXITING': return 'Leaving the risk area...';
    default: return state.lastLevel === 'UNKNOWN' ? 'Not enough data for this area' : 'No elevated risk here';
  }
};

class GeofenceService {
  async resolveRisk(h3Index, ts) {
    const r = await cellRisk.getCellRisk(h3Index, { now: new Date(ts) });
    return { riskLevel: r.riskLevel, totalRisk: r.totalRiskScore, dataConfidence: r.dataConfidence, lowConfidence: r.lowConfidence, cellId: r.cellId };
  }

  /**
   * Shared by check and sync. Returns the replay result, the final persisted state and the safety check
   * (if one was created). Retries once on a concurrent write.
   */
  async ingest(userId, rawReadings) {
    const now = new Date();
    const readings = rawReadings.map((r) => ({
      h3Index: cellRisk.toCell(r.latitude, r.longitude),
      timestamp: r.timestamp,
      accuracy: r.accuracy === undefined || r.accuracy === null ? undefined : Number(r.accuracy),
      latitude: Number(r.latitude),
      longitude: Number(r.longitude),
    }));

    const cache = new Map();
    const resolveRisk = async (h3Index, ts) => {
      const key = `${h3Index}:${Math.floor(ts / 3600000)}`;
      if (!cache.has(key)) cache.set(key, await this.resolveRisk(h3Index, ts));
      return cache.get(key);
    };

    let loaded;
    let result;
    let decision = { create: false, reason: 'no-new-readings' };
    let saved = false;

    for (let attempt = 0; attempt < 2 && !saved; attempt += 1) {
      loaded = await loadState(userId);
      result = await processReadings(loaded.state, readings, { resolveRisk, now });
      if (result.accepted === 0) return { result, loaded, state: loaded.state, decision, safetyCheck: null };

      const user = await User.findById(userId).select('emergencySettings').lean();
      const open = await SOSHistory.exists({ user: userId, status: { $in: sosService.OPEN } });
      decision = evaluatePrompt({
        state: result.state,
        now,
        autoSosEnabled: user?.emergencySettings?.autoSOS === true,
        hasActiveOrPending: Boolean(open),
      });
      const next = decision.markHandled ? { ...result.state, episodePrompted: true } : result.state;
      saved = await saveState(userId, loaded, next, result.last?.risk?.cellId);
      if (saved) result.state = next;
    }
    if (!saved) throw new ApiError(409, 'Another location update was processed at the same time. Please retry.');

    await this.persistEvents(userId, result.events, readings);

    let safetyCheck = null;
    if (decision.create) {
      const last = result.last;
      const journey = await Journey.findOne({ userId, status: 'ACTIVE' }).select('_id').lean();
      try {
        safetyCheck = await sosService.createSafetyCheck(
          userId,
          {
            trigger: 'GEOFENCE',
            coords: {
              latitude: last.reading.latitude,
              longitude: last.reading.longitude,
              accuracy: last.reading.accuracy ?? null,
              timestamp: new Date(last.ts),
              approximate: false,
            },
            journeyId: journey ? journey._id : null,
            h3Index: last.reading.h3Index,
            riskLevel: last.risk.riskLevel,
            zoneId: last.risk.cellId,
            reason: `Entered a ${String(last.risk.riskLevel).toLowerCase()} risk area`,
            idempotencyKey: `geofence:${userId}:${last.reading.h3Index}:${result.state.lastReadingAt}`,
          },
          now
        );
      } catch (error) {
        // Do not lose the prompt: let the next reading in this episode try again.
        logger.error(`[Geofence] safety check creation failed for ${userId}`, error);
        await UserGeofenceState.updateOne({ userId }, { $set: { episodePrompted: false } });
      }
    }

    return { result, loaded, state: result.state, decision, safetyCheck };
  }

  async persistEvents(userId, events, readings) {
    for (const e of events) {
      const key = `${e.event}:${e.timestamp}:${e.h3Index}`;
      const reading = readings.find((r) => r.h3Index === e.h3Index) || readings[0];
      await GeofenceEvent.updateOne(
        { userId, idempotencyKey: key },
        {
          $setOnInsert: {
            userId,
            event: e.event,
            zoneId: e.cellId || null,
            riskLevel: e.riskLevel,
            totalRisk: e.totalRisk,
            location: { type: 'Point', coordinates: [reading.longitude, reading.latitude] },
            timestamp: new Date(e.timestamp),
            historical: e.historical,
            idempotencyKey: key,
          },
        },
        { upsert: true }
      );
    }
  }

  /**
   * Stores events the PHONE raised offline (same shared state machine, parity-tested). History only: this never
   * touches the geofence state, never creates a safety check and never an SOS, whatever the event's age.
   * An event uses the same key as one derived by replaying the points (`event:timestampMs:cell`), so the history
   * has one entry for it whichever of the two reaches the server first.
   */
  async recordDeviceEvents(userId, events, { model = GeofenceEvent, now = new Date() } = {}) {
    const rejected = [];
    let inserted = 0;
    let duplicates = 0;
    for (let index = 0; index < events.length; index += 1) {
      const e = events[index];
      const ts = new Date(e.timestamp).getTime();
      if (Number.isNaN(ts) || ts > now.getTime() + 5 * 60000) { rejected.push({ index, reason: 'timestamp in the future or invalid' }); continue; }
      if (now.getTime() - ts > 30 * 86400000) { rejected.push({ index, reason: 'older than 30 days' }); continue; }
      const key = `${e.event}:${ts}:${e.h3Index}`;
      const res = await model.updateOne(
        { userId, idempotencyKey: key },
        {
          $setOnInsert: {
            userId,
            event: e.event,
            riskLevel: e.riskLevel,
            totalRisk: e.totalRisk ?? 0,
            location: { type: 'Point', coordinates: [Number(e.longitude), Number(e.latitude)] },
            timestamp: new Date(ts),
            historical: true,
            source: 'device',
            idempotencyKey: key,
          },
        },
        { upsert: true }
      );
      if (res && res.upsertedCount > 0) inserted += 1;
      else duplicates += 1;
    }
    return { received: events.length, inserted, duplicates, rejected };
  }

  /** One live GPS reading. */
  async check(userId, { latitude, longitude, accuracy, timestamp }) {
    const { result, state, safetyCheck, decision } = await this.ingest(userId, [{ latitude, longitude, accuracy, timestamp }]);

    let status = 'OK';
    if (result.accepted === 0) status = result.skipped.lowAccuracy > 0 ? 'LOW_ACCURACY' : 'STALE_READING';

    const last = result.last;

    // Shadow Mode: the same fresh reading also drives arrival detection (within ~100 m of the destination).
    if (status === 'OK') {
      journeyService
        .checkArrival(userId, { latitude: Number(latitude), longitude: Number(longitude), accuracy })
        .catch((e) => logger.error('[Geofence] arrival check failed', e));
    }
    // Lets the app stop background tracking once no journey is active (e.g. completed on arrival).
    const journeyActive = Boolean(await Journey.exists({ userId, status: 'ACTIVE' }));

    return {
      status,
      journeyActive,
      event: last ? last.event : 'NONE',
      phase: state.phase,
      insideDangerZone: isInside(state),
      riskLevel: state.lastLevel || 'UNKNOWN',
      totalRisk: state.lastScore ?? null,
      dataConfidence: last ? last.risk.dataConfidence : null,
      lowConfidence: last ? last.risk.lowConfidence : null,
      h3Index: state.currentH3,
      zoneId: last ? last.risk.cellId : null,
      message: status === 'LOW_ACCURACY'
        ? `GPS accuracy is too low (limit ${cfg.accuracyMaxMeters} m); reading ignored`
        : status === 'STALE_READING'
          ? 'Reading ignored (duplicate, out of order or future-dated)'
          : messageFor(state, last && last.message),
      progress: last ? last.progress : progressOf(state, Date.now(), cfg),
      accuracyMaxMeters: cfg.accuracyMaxMeters,
      promptDecision: decision.reason,
      safetyCheck,
    };
  }

  /**
   * Offline batch: replayed oldest first to rebuild history. Old events are stored as history only;
   * a safety check is created only if the user is STILL in danger at a fresh last point (< 10 min old).
   * Re-sending a batch is harmless: points at or before the last processed one are skipped.
   */
  async sync(userId, locations) {
    if (!Array.isArray(locations) || locations.length === 0) throw new ApiError(400, 'Locations array cannot be empty.');
    if (locations.length > cfg.syncMaxPoints) throw new ApiError(413, `At most ${cfg.syncMaxPoints} points per sync.`);

    const { result, state, safetyCheck, decision } = await this.ingest(userId, locations);
    const lastAt = result.last ? result.last.ts : state.lastReadingAt;
    const lastPointStale = lastAt === null || Date.now() - lastAt > cfg.historicalAfterMinutes * 60000;

    return {
      received: locations.length,
      accepted: result.accepted,
      skipped: result.skipped,
      eventsGenerated: result.events.length,
      historicalEvents: result.events.filter((e) => e.historical).length,
      events: result.events.map((e) => ({ ...e, timestamp: new Date(e.timestamp).toISOString() })),
      finalState: {
        phase: state.phase,
        insideDangerZone: isInside(state),
        riskLevel: state.lastLevel || 'UNKNOWN',
        totalRisk: state.lastScore ?? null,
        h3Index: state.currentH3,
        lastReadingAt: toDate(state.lastReadingAt),
      },
      // When the last point is old the user's current position is unknown: send a live /check next.
      lastPointStale,
      promptDecision: decision.reason,
      safetyCheck,
    };
  }

  async getGeofenceStatus(userId) {
    const doc = await UserGeofenceState.findOne({ userId }).lean();
    if (!doc || !doc.currentH3) {
      return { phase: 'SAFE', insideZone: false, currentH3: null, currentRisk: { riskLevel: 'UNKNOWN', totalRisk: null }, lastEvent: 'NONE', lastChecked: null };
    }
    // Risk is re-evaluated now: it changes with time of day and data freshness.
    const live = await this.resolveRisk(doc.currentH3, Date.now());
    return {
      phase: doc.phase,
      insideZone: Boolean(doc.insideDangerZone),
      currentH3: doc.currentH3,
      currentRisk: { riskLevel: live.riskLevel, totalRisk: live.totalRisk, dataConfidence: live.dataConfidence },
      lastEvent: doc.lastEvent,
      lastChecked: doc.lastChecked,
      cooldownUntil: doc.cooldownUntil && new Date(doc.cooldownUntil) > new Date() ? doc.cooldownUntil : null,
    };
  }

  async getGeofenceHistory(userId) {
    return GeofenceEvent.find({ userId }).sort({ timestamp: -1 }).limit(200).lean();
  }
}

module.exports = new GeofenceService();
