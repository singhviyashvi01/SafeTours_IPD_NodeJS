/**
 * newsSeverity.js — SafeTours IPD
 *
 * Configurable hazard score weights for news incident keywords.
 * These scores determine how much a specific keyword mention increases
 * the newsScore of a GridCell.
 */

const severityWeights = {
  'fire': 25,
  'explosion': 35,
  'accident': 15,
  'robbery': 18,
  'violence': 30,
  'flood': 20,
  'protest': 12,
  'building collapse': 35,
  'collapse': 25, // Fallback for general collapse news
  'crash': 15,    // Fallback for general crash news
};

const defaultNewsWeight = 10;

module.exports = {
  severityWeights,
  defaultNewsWeight,
};
