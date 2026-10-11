/**
 * communityConfig.js: the ONE place that defines community incident categories and how reports turn into a
 * risk score. The category list used by the API validator, the Incident model, the scoring and the app's
 * report form (GET /api/community/categories) all come from `incidentCategories`.
 *
 *   severity     points (0-100 scale, before time decay and verification) one active incident adds to its cell.
 *                The LOW / MEDIUM / HIGH / CRITICAL label stored on an incident is derived from these points
 *                with `severityBands`; there is no second, separate severity list.
 *   expiryHours  how long a report stays active (time decay runs from 1 at creation to 0 at expiry).
 */
const incidentCategories = {
  'Street Light Failure': { severity: 5, expiryHours: 48 },
  'Road Block': { severity: 8, expiryHours: 24 },
  Waterlogging: { severity: 10, expiryHours: 24 },
  Accident: { severity: 12, expiryHours: 24 },
  'Medical Emergency': { severity: 15, expiryHours: 6 },
  'Suspicious Activity': { severity: 18, expiryHours: 12 },
  Harassment: { severity: 25, expiryHours: 12 },
  Theft: { severity: 30, expiryHours: 24 },
  Assault: { severity: 40, expiryHours: 24 },
  Fire: { severity: 50, expiryHours: 6 },
  Other: { severity: 5, expiryHours: 24 },
};

// Label for a severity value: the first band whose `below` is greater than the value.
const severityBands = [
  { below: 12, label: 'LOW' },
  { below: 25, label: 'MEDIUM' },
  { below: 40, label: 'HIGH' },
  { below: Infinity, label: 'CRITICAL' },
];

const severityLabel = (points) => (severityBands.find((b) => points < b.below) || severityBands[severityBands.length - 1]).label;

/**
 * Scoring (see services/risk/communityScoring.js).
 *
 *   weight(incident) = severity x timeDecay x verification x falsePenalty x reporterFactor
 *   cell raw         = sum of weights in the cell (per-user capped) + spread from CONFIRMED neighbours
 *   cell score       = 100 x (1 - exp(-raw / saturation))
 *
 * "No reports" is different from "no data": where the community feed is healthy a cell without reports scores
 * 0 (a real observation) and the risk engine records a confidence note (risk.config community.absenceConfidenceFactor).
 */
const scoring = {
  saturation: 60,

  // An incident counts at 50% until it has this many confirmations from OTHER users, then at 100%.
  confirmationsForFullWeight: 3,
  // Each "report as false" removes this share of an incident's weight (floored at 0).
  falsePenaltyPerReport: 0.25,
  // This many "false" reports removes the incident altogether.
  removeAfterFalseReports: 5,

  // Spread to neighbouring cells. Only incidents confirmed by at least `minConfirmations` other users spread;
  // an unconfirmed report affects its own cell only. The factor falls with distance (grid rings).
  neighbours: {
    minConfirmations: 2,
    rings: [
      { ring: 1, factor: 0.5 },
      { ring: 2, factor: 0.25 },
    ],
  },

  // One user can add at most this many raw points to one cell, however many reports they file.
  perUserCellCap: 40,

  // Reporter reliability: how their earlier reports fared (last `lookbackDays`).
  //   confirmed: confirmed by `confirmedAt` or more other users and not removed
  //   rejected : removed, or flagged false `rejectedAt` or more times
  // reliability = (confirmed + priorConfirmed) / (confirmed + rejected + priorConfirmed + priorRejected)
  // so a new user starts at exactly 0.5 (neutral). factor = minFactor + (maxFactor - minFactor) x reliability,
  // which is 1.0 at 0.5.
  reliability: {
    lookbackDays: 90,
    confirmedAt: 2,
    rejectedAt: 3,
    priorConfirmed: 2,
    priorRejected: 2,
    minFactor: 0.6,
    maxFactor: 1.4,
  },

  // Duplicate handling when a report is filed.
  duplicate: {
    radiusMeters: 100,
    windowMinutes: 30,
  },
};

module.exports = {
  incidentCategories,
  severityBands,
  severityLabel,
  scoring,
};
