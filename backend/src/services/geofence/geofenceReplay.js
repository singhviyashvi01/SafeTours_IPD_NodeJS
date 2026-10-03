const defaultCfg = require('../../config/geofence.config');
const { step } = require('./geofenceStateMachine');

/**
 * Processes a list of GPS readings (one live reading, or an offline batch) through the state machine,
 * oldest first. Pure apart from the injected `resolveRisk`.
 *
 *  - readings stamped in the future are rejected
 *  - a reading at or before the last processed one is skipped (duplicate / out of order): this is how
 *    a re-sent batch is de-duplicated, because the persisted state remembers lastReadingAt
 *  - readings with accuracy worse than accuracyMaxMeters are skipped (not counted)
 *  - events older than historicalAfterMinutes at processing time are flagged historical; the caller
 *    stores them as history only
 *
 * @param {Object} state            persisted state (see geofenceStateMachine.initialState)
 * @param {Array<{h3Index:string, timestamp?:string|number|Date, accuracy?:number}>} readings
 * @param {{resolveRisk:(h3:string, ts:number)=>Promise<{riskLevel:string,totalRisk:number|null}>, now?:Date, cfg?:Object}} opts
 */
async function processReadings(state, readings, { resolveRisk, now = new Date(), cfg = defaultCfg }) {
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

module.exports = { processReadings };
