/**
 * communityConfig.js — SafeTours IPD
 *
 * Configurable list of incident categories, their default weights,
 * default severity levels, and default automatic expiration times.
 */

const incidentCategories = {
  'Street Light Failure': {
    weight: 5,
    expiryHours: 48,
    severity: 'LOW',
  },
  'Road Block': {
    weight: 8,
    expiryHours: 24,
    severity: 'LOW',
  },
  'Waterlogging': {
    weight: 10,
    expiryHours: 24,
    severity: 'LOW',
  },
  'Accident': {
    weight: 12,
    expiryHours: 24,
    severity: 'MEDIUM',
  },
  'Medical Emergency': {
    weight: 15,
    expiryHours: 6,
    severity: 'MEDIUM',
  },
  'Suspicious Activity': {
    weight: 18,
    expiryHours: 12,
    severity: 'MEDIUM',
  },
  'Harassment': {
    weight: 25,
    expiryHours: 12,
    severity: 'HIGH',
  },
  'Theft': {
    weight: 30,
    expiryHours: 24,
    severity: 'HIGH',
  },
  'Assault': {
    weight: 40,
    expiryHours: 24,
    severity: 'CRITICAL',
  },
  'Fire': {
    weight: 50,
    expiryHours: 6,
    severity: 'CRITICAL',
  },
  'Other': {
    weight: 5,
    expiryHours: 24,
    severity: 'LOW',
  },
};

// How incidents turn into a 0-100 community score for an H3 cell (see risk/communityComponent.js).
// cellScore = 100 * (1 - exp(-rawWeight / saturation)); rawWeight sums the incident weights in the
// cell plus neighborFactor x those in the six adjacent cells.
const scoring = {
  saturation: 60,
  neighborFactor: 0.5,
  // An incident counts at 50% until it has this many confirmations, then at 100%.
  confirmationsForFullWeight: 3,
  // Each "report as false" removes this share of an incident's weight.
  falsePenaltyPerReport: 0.25,
};

module.exports = {
  incidentCategories,
  scoring,
};
