/**
 * risk.config.js — the single source of truth for the SafeTours risk engine.
 *
 * Weights, thresholds, labels, freshness windows, the time-of-day modifier and the
 * festival calendar all live here. Nothing else in the codebase may hardcode them.
 *
 * Design notes
 * - Base risk = weighted mean of the components that currently have usable data, with the
 *   weights renormalised over those components (a missing component never counts as 0).
 * - Time of day is a MODIFIER, not a weighted factor. The clock does not create a hazard in
 *   a place that has none; it amplifies hazards that exist (night, festival crowds). As a
 *   weighted factor it would also inject a score into cells that have no data at all.
 * - dataConfidence = share of total weight that is backed by usable data (stale data counts
 *   at staleWeightFactor). It is returned with every risk result.
 */

const LEVELS = Object.freeze({
  SAFE: 'SAFE',
  LOW: 'LOW',
  MODERATE: 'MODERATE',
  HIGH: 'HIGH',
  EXTREME: 'EXTREME',
});

// Sentinel returned when there is not enough data to state a risk level honestly.
// It is NOT a risk label: it means "we do not know", and must never be shown as safe.
const UNKNOWN = 'UNKNOWN';

const config = {
  timezone: 'Asia/Kolkata',

  levels: LEVELS,
  unknownLevel: UNKNOWN,

  // Ascending. A score belongs to the last band whose `min` it reaches.
  thresholds: [
    { level: LEVELS.SAFE, min: 0 },
    { level: LEVELS.LOW, min: 20 },
    { level: LEVELS.MODERATE, min: 40 },
    { level: LEVELS.HIGH, min: 60 },
    { level: LEVELS.EXTREME, min: 80 },
  ],

  // Levels that count as a "danger zone" for geofence alerts.
  dangerLevels: [LEVELS.HIGH, LEVELS.EXTREME],

  /**
   * Components.
   *  mode 'cell': the score is stored per cell and is only usable if that cell has it.
   *  mode 'feed': the score defaults to 0 for cells without an entry, but only while the
   *               feed's last successful run (FeedStatus) is fresh. Used for signals where
   *               "nothing reported" is a real observation (news, community reports).
   *  ttlMinutes: age up to which the data is fresh. Between ttl and ttl*maxStaleFactor it is
   *              used at staleWeightFactor weight and flagged stale. Beyond that it is unusable.
   */
  components: {
    crime: { weight: 0.40, mode: 'cell', ttlMinutes: 60 * 24 * 180, label: 'Crime' },
    weather: { weight: 0.20, mode: 'cell', ttlMinutes: 90, label: 'Weather' },
    crowd: { weight: 0.15, mode: 'cell', ttlMinutes: 60 * 12, label: 'Crowd' },
    community: { weight: 0.15, mode: 'feed', ttlMinutes: 60 * 3, label: 'Community' },
    news: { weight: 0.10, mode: 'feed', ttlMinutes: 120, label: 'News' },
  },

  staleWeightFactor: 0.5,
  maxStaleFactor: 4,
  // A component flagged meta.lowConfidence or meta.demo counts at this fraction of its weight
  // in the confidence calculation (its score is still used).
  lowConfidenceWeightFactor: 0.5,

  // If any of these has no usable data the result is flagged lowConfidence, whatever the
  // coverage number says (crime is the heaviest signal; without it the score is partial).
  criticalComponents: ['crime'],

  confidence: {
    high: 0.85, // dataConfidence >= high   -> HIGH
    medium: 0.6, // dataConfidence >= medium -> MEDIUM, otherwise LOW
    // Below this coverage the engine refuses to name a level and returns UNKNOWN.
    minCoverageForLevel: 0.35,
  },

  /**
   * Time-of-day modifier (local hours in `timezone`). First matching band wins.
   * Multiplies the base risk; the result is clamped to 0..100.
   */
  timeModifier: {
    bands: [
      { from: 22, to: 5, multiplier: 1.2, label: 'night' },
      { from: 19, to: 22, multiplier: 1.08, label: 'evening' },
      { from: 5, to: 19, multiplier: 1.0, label: 'day' },
    ],
  },

  // Festival calendar. Dates are inclusive (YYYY-MM-DD, local time). Crowds and incidents rise
  // during these windows. Calendar dates change every year: update this list annually.
  festivals: [
    { name: 'Holi', start: '2026-03-03', end: '2026-03-05', riskBoost: 1.1, crowdBonus: 20 },
    { name: 'Ganesh Chaturthi', start: '2026-09-14', end: '2026-09-24', riskBoost: 1.1, crowdBonus: 30 },
    { name: 'Navratri', start: '2026-10-11', end: '2026-10-20', riskBoost: 1.08, crowdBonus: 20 },
    { name: 'Diwali', start: '2026-11-06', end: '2026-11-10', riskBoost: 1.1, crowdBonus: 25 },
    { name: "New Year's Eve", start: '2026-12-31', end: '2027-01-01', riskBoost: 1.12, crowdBonus: 30 },
  ],
};

/** Maps a 0..100 score to one of the five levels. */
function levelForScore(score) {
  let level = config.thresholds[0].level;
  for (const band of config.thresholds) {
    if (score >= band.min) level = band.level;
  }
  return level;
}

function validateConfig() {
  const sum = Object.values(config.components).reduce((acc, c) => acc + c.weight, 0);
  if (Math.abs(sum - 1) > 1e-9) {
    throw new Error(`risk.config: component weights must sum to 1.0 (got ${sum})`);
  }
}
validateConfig();

module.exports = { ...config, LEVELS, UNKNOWN, levelForScore };
