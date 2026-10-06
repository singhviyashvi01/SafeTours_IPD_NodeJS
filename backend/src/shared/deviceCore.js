'use strict';

/**
 * deviceCore: the logic that must behave IDENTICALLY on the server and on the phone.
 *
 *   - time-of-day / festival risk multiplier (timeModifier)
 *   - geofence state machine with dwell + hysteresis (initialState, step)
 *   - chronological replay of GPS readings with accuracy / duplicate / future filtering (processReadings)
 *
 * It is pure CommonJS with no imports and takes every threshold as a parameter, so the same file runs in
 * Node and in React Native (Metro).
 *
 * KEEP IN SYNC: two byte-identical copies exist,
 *     backend/src/shared/deviceCore.js        (this file, the source of truth)
 *     frontend/src/offline/deviceCore.js      (copy used on the device)
 * (the app cannot import from outside its own folder in an EAS build). The backend test
 * src/shared/deviceCore.parity.test.js FAILS if the copies differ and replays shared fixtures through both.
 * After editing this file run:  npm run sync:device-core   (in backend/)
 */

// ─── time ───────────────────────────────────────────────────────────────────

// Fixed-offset zones are computed arithmetically instead of through Intl: Hermes' Intl timeZone support
// varies by platform, and India has no daylight-saving time.
const FIXED_OFFSET_MINUTES = { 'Asia/Kolkata': 330 };

const pad2 = (n) => String(n).padStart(2, '0');

/** Local calendar date (YYYY-MM-DD) and hour (0-23) in `timezone`. */
function localTime(now, timezone) {
  const offset = FIXED_OFFSET_MINUTES[timezone];
  if (offset !== undefined) {
    const t = new Date(now.getTime() + offset * 60000);
    return { date: `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`, hour: t.getUTCHours() };
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const p = {};
  for (const x of parts) p[x.type] = x.value;
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

/**
 * @param {Date} now
 * @param {{timezone:string, timeModifier:{bands:Array<{from:number,to:number,multiplier:number,label:string}>},
 *          festivals:Array<{name:string,start:string,end:string,riskBoost:number}>}} cfg
 */
function timeModifier(now, cfg) {
  const { date, hour } = localTime(now, cfg.timezone);
  const band = cfg.timeModifier.bands.find((b) => (b.from <= b.to ? hour >= b.from && hour < b.to : hour >= b.from || hour < b.to));
  const time = { multiplier: band ? band.multiplier : 1, label: band ? band.label : 'day', localHour: hour };
  const festival = cfg.festivals.find((f) => date >= f.start && date <= f.end) || null;
  return {
    time,
    festival: festival ? { name: festival.name, multiplier: festival.riskBoost } : null,
    combinedMultiplier: time.multiplier * (festival ? festival.riskBoost : 1),
    localDate: date,
  };
}

// ─── geofence state machine ─────────────────────────────────────────────────

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

/** UNKNOWN (null score) is never danger. Hysteresis: entering needs >= enterScore, staying needs >= exitScore. */
function isDangerReading(phase, score, cfg) {
  if (score === null || score === undefined || Number.isNaN(score)) return false;
  return IN_DANGER_PHASES.has(phase) ? score >= cfg.exitScore : score >= cfg.enterScore;
}

function dwellReached(count, since, t, needed, dwellSeconds, cfg) {
  if (count >= needed) return true;
  return count >= cfg.minReadingsForDwell && since !== null && t - since >= dwellSeconds * 1000;
}

const levelLabel = (level) => (level ? level.charAt(0) + level.slice(1).toLowerCase() : 'unknown');

function progressOf(s, t, cfg) {
  return {
    enter: s.phase === 'ENTERING'
      ? { readings: s.dangerReadings, neededReadings: cfg.enterReadings, elapsedSeconds: Math.round((t - s.dangerSince) / 1000), neededSeconds: cfg.enterDwellSeconds }
      : null,
    exit: s.phase === 'EXITING'
      ? { readings: s.safeReadings, neededReadings: cfg.exitReadings, elapsedSeconds: Math.round((t - s.safeSince) / 1000), neededSeconds: cfg.exitDwellSeconds }
      : null,
  };
}

/**
 * SAFE -> ENTERING -> IN_DANGER -> EXITING -> SAFE (see the backend docs of geofenceStateMachine).
 * @param {Object} state
 * @param {{h3Index:string, riskLevel:string, totalRisk:number|null, timestamp:number}} obs
 */
function step(state, obs, cfg) {
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

// ─── replay ─────────────────────────────────────────────────────────────────

/**
 * Runs readings through the state machine oldest first.
 *  - future-dated readings are rejected
 *  - a reading at or before the last processed one is skipped (duplicate / out of order)
 *  - readings less accurate than cfg.accuracyMaxMeters are skipped
 *  - events older than cfg.historicalAfterMinutes at processing time are flagged historical
 * @param {{resolveRisk:(h3:string, ts:number)=>Promise<{riskLevel:string,totalRisk:number|null}>, now?:Date}} opts
 */
async function processReadings(state, readings, opts) {
  const { resolveRisk, cfg } = opts;
  const now = opts.now || new Date();
  const nowMs = now.getTime();
  const skipped = { future: 0, duplicateOrOlder: 0, lowAccuracy: 0 };

  const prepared = readings
    .map((r) => {
      const t = r.timestamp === undefined || r.timestamp === null ? nowMs : new Date(r.timestamp).getTime();
      return { ...r, ts: Number.isNaN(t) ? nowMs : t };
    })
    .sort((a, b) => a.ts - b.ts);

  let current = state;
  const events = [];
  const accepted = [];
  let lastStep = null;

  for (const r of prepared) {
    if (r.ts > nowMs + cfg.futureToleranceSeconds * 1000) {
      skipped.future += 1;
      continue;
    }
    if (current.lastReadingAt !== null && r.ts <= current.lastReadingAt) {
      skipped.duplicateOrOlder += 1;
      continue;
    }
    if (Number.isFinite(r.accuracy) && r.accuracy > cfg.accuracyMaxMeters) {
      skipped.lowAccuracy += 1;
      continue;
    }

    const risk = await resolveRisk(r.h3Index, r.ts);
    const result = step(current, { h3Index: r.h3Index, riskLevel: risk.riskLevel, totalRisk: risk.totalRisk, timestamp: r.ts }, cfg);
    current = result.state;
    lastStep = { ...result, risk, ts: r.ts, reading: r };
    accepted.push(r);

    if (['ENTER', 'EXIT', 'ZONE_CHANGED'].includes(result.event)) {
      events.push({
        event: result.event,
        h3Index: r.h3Index,
        riskLevel: risk.riskLevel,
        totalRisk: risk.totalRisk,
        cellId: risk.cellId || null,
        timestamp: r.ts,
        message: result.message,
        historical: nowMs - r.ts > cfg.historicalAfterMinutes * 60000,
      });
    }
  }

  return { state: current, events, accepted: accepted.length, skipped, last: lastStep };
}

module.exports = { localTime, timeModifier, initialState, isInside, isDangerReading, progressOf, step, processReadings };
