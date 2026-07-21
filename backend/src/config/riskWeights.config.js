/**
 * Risk Weights and Level Threshold Configuration — SafeTours IPD
 *
 * Purpose of this file:
 * Provide configurable weights and risk level thresholds for the centralized Risk Score Engine.
 * Modifying weights here dynamically updates the composite risk score calculation across the system.
 */

const RISK_WEIGHTS = {
  crime: 0.40,      // 40%
  weather: 0.20,    // 20%
  crowd: 0.15,      // 15%
  community: 0.15,  // 15%
  news: 0.10,       // 10%
  ews: 0.00,        // 0%  (Reserved for future EWS integration)
};

const RISK_LEVELS = Object.freeze({
  SAFE: 'SAFE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME',
});

const RISK_THRESHOLDS = [
  { level: RISK_LEVELS.SAFE,     min: 0,  max: 19.999 },
  { level: RISK_LEVELS.LOW,      min: 20, max: 39.999 },
  { level: RISK_LEVELS.MODERATE, min: 40, max: 59.999 },
  { level: RISK_LEVELS.HIGH,     min: 60, max: 79.999 },
  { level: RISK_LEVELS.EXTREME,  min: 80, max: 100 },
];

module.exports = {
  RISK_WEIGHTS,
  RISK_LEVELS,
  RISK_THRESHOLDS,
};
