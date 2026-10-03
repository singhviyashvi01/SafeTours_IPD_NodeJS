const h3 = require('h3-js');
const Incident = require('../../models/Incident');
const { incidentCategories, scoring } = require('../../config/communityConfig');
const { setComponentScores, clearComponent } = require('./cellRisk.service');
const feedStatus = require('./feedStatus.service');
const logger = require('../../utils/logger');

/**
 * Community component: turns active, user-reported incidents into a 0-100 score per H3 cell.
 *
 * weight(incident) = categoryWeight x timeDecay x verification x falsePenalty
 *   timeDecay     linear from 1 (when reported) to 0 (at expiresAt; TTL comes from communityConfig)
 *   verification  0.5 until confirmationsForFullWeight confirmations, then 1 (one unconfirmed
 *                 report can never spike a cell)
 *   falsePenalty  1 - falsePenaltyPerReport x "reported false" votes (floored at 0)
 * cellScore = 100 x (1 - exp(-(own + neighborFactor x ring1) / saturation))
 */

function incidentWeight(inc, now) {
  const category = incidentCategories[inc.incidentType];
  const base = category ? category.weight : 5;

  const created = new Date(inc.createdAt).getTime();
  const expires = new Date(inc.expiresAt).getTime();
  const life = Math.max(1, expires - created);
  const decay = Math.min(1, Math.max(0, (expires - now.getTime()) / life));

  const confirmations = Math.max(0, inc.confirmationCount || 0);
  const verification = 0.5 + 0.5 * Math.min(1, confirmations / scoring.confirmationsForFullWeight);
  const falsePenalty = Math.max(0, 1 - scoring.falsePenaltyPerReport * (inc.falseReportCount || 0));

  return base * decay * verification * falsePenalty;
}

/** Pure: scores for `targetCells` given the active incidents around them. */
function scoreCells(targetCells, incidents, now = new Date()) {
  const weightByCell = new Map();
  for (const inc of incidents) {
    const w = incidentWeight(inc, now);
    if (w <= 0) continue;
    weightByCell.set(inc.h3CellId, (weightByCell.get(inc.h3CellId) || 0) + w);
  }

  const scores = {};
  for (const cell of targetCells) {
    const ring1 = h3.gridDisk(cell, 1);
    let raw = 0;
    for (const c of ring1) {
      const w = weightByCell.get(c) || 0;
      raw += c === cell ? w : w * scoring.neighborFactor;
    }
    scores[cell] = Math.round(100 * (1 - Math.exp(-raw / scoring.saturation)) * 10) / 10;
  }
  return scores;
}

async function activeIncidentsIn(cells, now) {
  return Incident.find({
    status: 'ACTIVE',
    expiresAt: { $gt: now },
    h3CellId: { $in: cells },
  })
    .select('incidentType h3CellId createdAt expiresAt confirmationCount falseReportCount')
    .lean();
}

/**
 * Recomputes the community score for the given cells and their neighbours (call after a report,
 * confirmation or false-flag changes an incident in those cells).
 */
async function recomputeAround(changedCells) {
  const now = new Date();
  const targets = new Set();
  const sources = new Set();
  for (const c of changedCells) {
    for (const t of h3.gridDisk(c, 1)) targets.add(t); // cells whose score may change
    for (const s of h3.gridDisk(c, 2)) sources.add(s); // incidents that can influence them
  }
  const incidents = await activeIncidentsIn([...sources], now);
  const scores = scoreCells([...targets], incidents, now);
  await setComponentScores('community', scores, { now });
  return Object.keys(scores).length;
}

/**
 * Full sweep (every few minutes): recompute every cell touched by an active incident, zero the
 * rest that still hold a score (their incidents expired or decayed away), and record a heartbeat
 * so the risk engine knows the community feed is alive.
 */
async function sweepAll() {
  const now = new Date();
  const incidents = await Incident.find({ status: 'ACTIVE', expiresAt: { $gt: now } })
    .select('incidentType h3CellId createdAt expiresAt confirmationCount falseReportCount')
    .lean();

  const targets = new Set();
  for (const inc of incidents) for (const t of h3.gridDisk(inc.h3CellId, 1)) targets.add(t);

  const scores = scoreCells([...targets], incidents, now);
  await setComponentScores('community', scores, { now });
  const cleared = await clearComponent('community', { now, except: Object.keys(scores) });
  await feedStatus.markSuccess('community', { activeIncidents: incidents.length, cellsScored: targets.size, cleared });
  logger.info(`[community] sweep: ${incidents.length} active incidents, ${targets.size} cells scored, ${cleared} cleared`);
}

module.exports = { incidentWeight, scoreCells, recomputeAround, sweepAll };
