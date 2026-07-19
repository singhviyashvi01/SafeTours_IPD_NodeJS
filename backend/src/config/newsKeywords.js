/**
 * Central place for incident-related keywords and weights.
 *
 * Why this exists:
 * The news risk engine should not hardcode keyword matching inside controllers or
 * services. Keeping it here makes it easy to tune severity thresholds later without
 * changing route or controller logic.
 */
const incidentKeywords = [
  { keyword: 'riot', weight: 9, severity: 'critical' },
  { keyword: 'terror', weight: 9, severity: 'critical' },
  { keyword: 'explosion', weight: 9, severity: 'critical' },
  { keyword: 'shooting', weight: 9, severity: 'critical' },
  { keyword: 'bomb', weight: 9, severity: 'critical' },
  { keyword: 'earthquake', weight: 8, severity: 'critical' },
  { keyword: 'cyclone', weight: 8, severity: 'critical' },
  { keyword: 'flood', weight: 8, severity: 'critical' },
  { keyword: 'landslide', weight: 8, severity: 'critical' },
  { keyword: 'building collapse', weight: 8, severity: 'critical' },
  { keyword: 'bridge collapse', weight: 8, severity: 'critical' },
  { keyword: 'fire', weight: 7, severity: 'high' },
  { keyword: 'accident', weight: 6, severity: 'high' },
  { keyword: 'road closure', weight: 6, severity: 'high' },
  { keyword: 'road blocked', weight: 6, severity: 'high' },
  { keyword: 'traffic', weight: 5, severity: 'medium' },
  { keyword: 'waterlogging', weight: 5, severity: 'medium' },
  { keyword: 'protest', weight: 5, severity: 'medium' },
  { keyword: 'strike', weight: 4, severity: 'medium' },
];

const defaultWeights = {
  weather: 0.4,
  flood: 0.2,
  news: 0.4,
};

module.exports = {
  incidentKeywords,
  defaultWeights,
};
