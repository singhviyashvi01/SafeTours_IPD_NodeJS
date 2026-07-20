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

module.exports = {
  incidentCategories,
};
