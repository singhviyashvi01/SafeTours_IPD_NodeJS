const GridCell = require('../models/GridCell');
const riskWeights = require('../config/riskWeights');
const { getRiskLevel } = require('../utils/riskLevel');
const logger = require('../utils/logger');

const SCORE_FIELDS = Object.freeze(['crimeScore', 'crowdScore', 'weatherScore', 'newsScore']);
const MAX_SCORE = 100;

function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(MAX_SCORE, score));
}

function getValidatedWeights() {
  const weights = Object.values(riskWeights);
  if (weights.length !== 4 || weights.some((weight) => !Number.isFinite(weight) || weight < 0)) {
    throw new Error('Risk weight configuration is invalid.');
  }

  return riskWeights;
}

function calculateRisk(gridCell = {}) {
  const weights = getValidatedWeights();
  const totalRisk = Math.round(Math.max(0, Math.min(MAX_SCORE,
    (normalizeScore(gridCell.crimeScore) * weights.crime)
    + (normalizeScore(gridCell.crowdScore) * weights.crowd)
    + (normalizeScore(gridCell.weatherScore) * weights.weather)
    + (normalizeScore(gridCell.newsScore) * weights.news)
  )));

  return { totalRisk, level: getRiskLevel(totalRisk) };
}

function buildCellUpdate(cell, scoreChanges) {
  const nextCell = { ...cell };
  const set = {};

  for (const [field, value] of Object.entries(scoreChanges)) {
    if (!SCORE_FIELDS.includes(field)) {
      throw new Error(`Unsupported risk score field: ${field}`);
    }

    const normalizedValue = normalizeScore(value);
    nextCell[field] = normalizedValue;
    if (Number(cell[field] || 0) !== normalizedValue) {
      set[field] = normalizedValue;
    }
  }

  const risk = calculateRisk(nextCell);
  if (Number(cell.totalRisk || 0) !== risk.totalRisk) set.totalRisk = risk.totalRisk;
  if (cell.level !== risk.level) set.level = risk.level;

  return { set, risk, levelChanged: cell.level !== risk.level };
}

async function updateGridCellScores(filter, scoreChanges = {}) {
  try {
    const cells = await GridCell.find(filter)
      .select('_id crimeScore crowdScore weatherScore newsScore totalRisk level')
      .lean();

    if (cells.length === 0) {
      logger.warn('[RiskEngine] No GridCells matched score update.');
      return { matchedCount: 0, modifiedCount: 0, levelChanges: 0 };
    }

    const now = new Date();
    let levelChanges = 0;
    const operations = cells.reduce((updates, cell) => {
      const { set, levelChanged } = buildCellUpdate(cell, scoreChanges);
      if (Object.keys(set).length === 0) return updates;

      if (levelChanged) levelChanges += 1;
      updates.push({
        updateOne: {
          filter: { _id: cell._id },
          update: { $set: { ...set, updatedAt: now } },
        },
      });
      return updates;
    }, []);

    if (operations.length === 0) {
      return { matchedCount: cells.length, modifiedCount: 0, levelChanges: 0 };
    }

    const result = await GridCell.bulkWrite(operations, { ordered: false });
    logger.info(`[RiskEngine] Risk calculation completed for ${operations.length} GridCells (${levelChanges} level changes).`);
    return {
      matchedCount: cells.length,
      modifiedCount: result.modifiedCount,
      levelChanges,
    };
  } catch (error) {
    logger.error('[RiskEngine] Failed to update GridCell risk.', error);
    throw error;
  }
}

async function updateGridCellScoresByH3Index(scoreField, scoresByH3Index) {
  const h3Indexes = Object.keys(scoresByH3Index || {});
  if (h3Indexes.length === 0) {
    return { matchedCount: 0, modifiedCount: 0, levelChanges: 0 };
  }

  try {
    const cells = await GridCell.find({
      $or: [{ h3Index: { $in: h3Indexes } }, { h3CellId: { $in: h3Indexes } }],
    }).select('_id h3Index h3CellId crimeScore crowdScore weatherScore newsScore totalRisk level').lean();

    const now = new Date();
    let levelChanges = 0;
    const operations = cells.reduce((updates, cell) => {
      const h3Index = scoresByH3Index[cell.h3Index] === undefined ? cell.h3CellId : cell.h3Index;
      const { set, levelChanged } = buildCellUpdate(cell, { [scoreField]: scoresByH3Index[h3Index] });
      if (Object.keys(set).length === 0) return updates;

      if (levelChanged) levelChanges += 1;
      updates.push({
        updateOne: {
          filter: { _id: cell._id },
          update: { $set: { ...set, updatedAt: now } },
        },
      });
      return updates;
    }, []);

    if (operations.length === 0) {
      return { matchedCount: cells.length, modifiedCount: 0, levelChanges: 0 };
    }

    const result = await GridCell.bulkWrite(operations, { ordered: false });
    logger.info(`[RiskEngine] Risk calculation completed for ${operations.length} GridCells (${levelChanges} level changes).`);
    return { matchedCount: cells.length, modifiedCount: result.modifiedCount, levelChanges };
  } catch (error) {
    logger.error('[RiskEngine] Failed to update GridCell risk by H3 index.', error);
    throw error;
  }
}

module.exports = {
  calculateRisk,
  normalizeScore,
  updateGridCellScores,
  updateGridCellScoresByH3Index,
};
