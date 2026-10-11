const h3 = require('h3-js');
const mongoose = require('mongoose');
const Incident = require('../../models/Incident');
const communityCfg = require('../../config/communityConfig');
const scoring = require('./communityScoring');
const { setComponentScores, clearComponent } = require('./cellRisk.service');
const feedStatus = require('./feedStatus.service');
const logger = require('../../utils/logger');

/**
 * Community component: turns active, user-reported incidents into a 0-100 score per H3 cell and writes it
 * through the normal component store (cellRisk.service.setComponentScores('community', ...)), where the risk
 * engine reads it like every other component.
 *
 * The maths lives in communityScoring.js (pure, unit-tested); this file only loads incidents and reporter
 * history and stores the result. Real reports only: the component never carries demo meta.
 */

const FIELDS = 'userId incidentType h3CellId createdAt expiresAt confirmationCount falseReportCount';
const toId = (u) => String(u);

/**
 * Reporter reliability factors for the given users, from how their reports fared in the lookback window.
 * confirmed = confirmed by >= confirmedAt other users and not removed; rejected = removed or flagged false
 * >= rejectedAt times. Users without history are not in the map (factor 1.0 = neutral).
 * @returns {Promise<Map<string, number>>}
 */
async function reporterFactors(userIds) {
  const unique = [...new Set(userIds.map(toId))];
  const factors = new Map();
  if (unique.length === 0) return factors;
  const r = communityCfg.scoring.reliability;
  const since = new Date(Date.now() - r.lookbackDays * 86400000);

  const rows = await Incident.aggregate([
    { $match: { userId: { $in: unique.map((id) => new mongoose.Types.ObjectId(id)) }, createdAt: { $gte: since } } },
    {
      $group: {
        _id: '$userId',
        confirmedReports: {
          $sum: { $cond: [{ $and: [{ $gte: ['$confirmationCount', r.confirmedAt] }, { $ne: ['$status', 'REMOVED'] }] }, 1, 0] },
        },
        rejectedReports: {
          $sum: { $cond: [{ $or: [{ $eq: ['$status', 'REMOVED'] }, { $gte: ['$falseReportCount', r.rejectedAt] }] }, 1, 0] },
        },
      },
    },
  ]);
  for (const row of rows) factors.set(toId(row._id), scoring.factorFromCounts(row));
  return factors;
}

async function writeScores(targets, incidents, now) {
  const factorByUser = await reporterFactors(incidents.map((i) => i.userId).filter(Boolean));
  const { scores, reports } = scoring.scoreCellsDetailed(targets, incidents, now, { factorByUser });
  await setComponentScores('community', scores, { now, meta: (h3Index) => ({ reports: reports[h3Index] || 0 }) });
  return scores;
}

/**
 * Recomputes the community score for the given cells and everything they can influence (call after a report,
 * confirmation or false flag changes an incident in those cells).
 */
async function recomputeAround(changedCells) {
  const now = new Date();
  const reach = scoring.influenceRadius();
  const targets = new Set();
  const sources = new Set();
  for (const c of changedCells) {
    for (const t of h3.gridDisk(c, reach)) targets.add(t); // cells whose score may change
    for (const s of h3.gridDisk(c, reach * 2)) sources.add(s); // incidents that can influence them
  }
  const incidents = await Incident.find({ status: 'ACTIVE', expiresAt: { $gt: now }, h3CellId: { $in: [...sources] } }).select(FIELDS).lean();
  const scores = await writeScores([...targets], incidents, now);
  return Object.keys(scores).length;
}

/**
 * Full sweep (every few minutes): recompute every cell touched by an active incident, zero the rest that still
 * hold a score (their incidents expired or decayed away), and record a heartbeat so the risk engine knows the
 * community feed is alive. A healthy feed with no reports in a cell means "no reports", which scores 0.
 */
async function sweepAll() {
  const now = new Date();
  const incidents = await Incident.find({ status: 'ACTIVE', expiresAt: { $gt: now } }).select(FIELDS).lean();

  const reach = scoring.influenceRadius();
  const targets = new Set();
  for (const inc of incidents) for (const t of h3.gridDisk(inc.h3CellId, reach)) targets.add(t);

  const scores = await writeScores([...targets], incidents, now);
  const cleared = await clearComponent('community', { now, except: Object.keys(scores) });
  await feedStatus.markSuccess('community', { activeIncidents: incidents.length, cellsScored: targets.size, cleared });
  logger.info(`[community] sweep: ${incidents.length} active incidents, ${targets.size} cells scored, ${cleared} cleared`);
}

/**
 * Debug view of one cell's community score: every active incident that can influence it, with the weight it
 * contributes and why (decay, verification, false flags, reporter factor, spread from neighbours).
 */
async function explainCell(h3Index, now = new Date()) {
  const reach = scoring.influenceRadius();
  const area = h3.gridDisk(h3Index, reach);
  const incidents = await Incident.find({ status: 'ACTIVE', expiresAt: { $gt: now }, h3CellId: { $in: area } }).select(FIELDS).lean();
  const factorByUser = await reporterFactors(incidents.map((i) => i.userId).filter(Boolean));
  const detailed = scoring.scoreCellsDetailed([h3Index], incidents, now, { factorByUser });
  return {
    score: detailed.scores[h3Index],
    reportsInCell: detailed.reports[h3Index],
    incidents: incidents.map((i) => ({
      id: String(i._id),
      type: i.incidentType,
      cell: i.h3CellId,
      ownCell: i.h3CellId === h3Index,
      ringDistance: i.h3CellId === h3Index ? 0 : h3.gridDistance(i.h3CellId, h3Index),
      confirmations: i.confirmationCount || 0,
      falseReports: i.falseReportCount || 0,
      spreads: (i.confirmationCount || 0) >= communityCfg.scoring.neighbours.minConfirmations,
      reporterFactor: Math.round((factorByUser.get(toId(i.userId)) || 1) * 100) / 100,
      weight: Math.round(scoring.incidentWeight(i, now, { factorByUser }) * 100) / 100,
      expiresAt: i.expiresAt,
    })),
  };
}

module.exports = {
  explainCell,
  incidentWeight: scoring.incidentWeight,
  scoreCells: scoring.scoreCells,
  scoreCellsDetailed: scoring.scoreCellsDetailed,
  reporterFactors,
  recomputeAround,
  sweepAll,
};
