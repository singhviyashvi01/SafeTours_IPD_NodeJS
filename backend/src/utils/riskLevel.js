const RISK_LEVELS = Object.freeze({
  SAFE: 'SAFE',
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME',
});

const RISK_THRESHOLDS = Object.freeze([
  { max: 20, level: RISK_LEVELS.SAFE },
  { max: 40, level: RISK_LEVELS.LOW },
  { max: 60, level: RISK_LEVELS.MEDIUM },
  { max: 80, level: RISK_LEVELS.HIGH },
]);

function getRiskLevel(totalRisk) {
  const score = Number(totalRisk);

  if (!Number.isFinite(score) || score <= 0) {
    return RISK_LEVELS.SAFE;
  }

  const threshold = RISK_THRESHOLDS.find(({ max }) => score <= max);
  return threshold ? threshold.level : RISK_LEVELS.EXTREME;
}

module.exports = {
  RISK_LEVELS,
  RISK_THRESHOLDS,
  getRiskLevel,
};
