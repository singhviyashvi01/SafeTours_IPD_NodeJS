'use strict';

const core = require('./deviceCore');

/**
 * On-device geofence evaluation (pure; storage is injected).
 *
 * The cached cell rows come from the server (GET /api/risk/cells?compact=true). Offline we re-apply the
 * time-of-day / festival multiplier to the cell's baseRisk with the SAME code the server uses
 * (deviceCore.timeModifier), so a cell cached at 6 pm is scored correctly at 11 pm.
 *
 * A cell that is not in the cache, or that the server itself reported as UNKNOWN, is NO DATA: it is
 * returned as UNKNOWN with a null score, which the state machine never treats as danger. It is never SAFE.
 */

const round1 = (n) => Math.round(n * 10) / 10;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

function levelForScore(score, thresholds) {
  let level = thresholds[0].level;
  for (const band of thresholds) if (score >= band.min) level = band.level;
  return level;
}

const NO_DATA = Object.freeze({ riskLevel: 'UNKNOWN', totalRisk: null, noData: true, dataConfidence: null, lowConfidence: true, demo: false, fetchedAt: null });

/**
 * Risk of a cached cell row at time `ts`.
 * @param {{h3Index:string, level:string, score:number|null, baseRisk:number|null, confidence:number, lowConfidence:boolean, demo:boolean, fetchedAt:number}|null} row
 * @param {number} ts ms
 * @param {Object} riskCfg client config `risk` section
 */
function cellRiskAt(row, ts, riskCfg) {
  if (!row || row.level === 'UNKNOWN') return { ...NO_DATA, fetchedAt: row ? row.fetchedAt : null, noData: true };

  let totalRisk = row.score;
  if (row.baseRisk !== null && row.baseRisk !== undefined) {
    const mult = core.timeModifier(new Date(ts), riskCfg).combinedMultiplier;
    totalRisk = round1(clamp(row.baseRisk * mult, 0, 100));
  }
  if (totalRisk === null || totalRisk === undefined) return { ...NO_DATA, fetchedAt: row.fetchedAt };
  return {
    riskLevel: levelForScore(totalRisk, riskCfg.thresholds),
    totalRisk,
    noData: false,
    dataConfidence: row.confidence,
    lowConfidence: Boolean(row.lowConfidence),
    demo: Boolean(row.demo),
    fetchedAt: row.fetchedAt,
  };
}

/**
 * Runs readings through the shared state machine using cached cells.
 * @param {Object} state            device geofence state (deviceCore.initialState())
 * @param {Array}  readings         [{h3Index, timestamp, accuracy, latitude, longitude}] (h3Index is res 9)
 * @param {{getCell:(h3:string)=>Promise<Object|null>, clientConfig:{geofence:Object, risk:Object}, now?:Date}} opts
 */
async function evaluateReadings(state, readings, { getCell, clientConfig, now = new Date() }) {
  const resolveRisk = async (h3Index, ts) => cellRiskAt(await getCell(h3Index), ts, clientConfig.risk);
  const result = await core.processReadings(state, readings, { resolveRisk, now, cfg: clientConfig.geofence });
  return { ...result, source: 'device' };
}

module.exports = { cellRiskAt, evaluateReadings, levelForScore };
