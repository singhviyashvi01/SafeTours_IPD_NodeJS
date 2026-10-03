/**
 * crowd.config.js: tunables of the crowd component (services/crowd, scheduler/crowdScheduler.js).
 *
 * Crowd RISK here means over-crowding (stations at rush hour, malls on a Saturday evening, festival
 * crowds), because that is what raises pickpocketing and crush risk. It is derived from where crowd
 * magnets are (Geoapify Places), when they are busy (profile x hour x weekday/weekend, in IST) and
 * whether a festival is on (festival calendar in config/risk.config.js). Remote areas get a low
 * crowd score, not a high "isolation" one.
 */

module.exports = {
  /**
   * Crowd magnets. weight = crowd units a single place adds to its own cell at peak (before time
   * profile); profile picks the time-of-day curve below. `geoapify` is the Places category queried.
   */
  categories: [
    { geoapify: 'public_transport.train', key: 'railway_station', weight: 45, profile: 'commute' },
    { geoapify: 'public_transport.subway', key: 'metro_station', weight: 30, profile: 'commute' },
    { geoapify: 'airport', key: 'airport', weight: 40, profile: 'commute' },
    { geoapify: 'commercial.shopping_mall', key: 'shopping_mall', weight: 30, profile: 'leisure' },
    { geoapify: 'commercial.marketplace', key: 'marketplace', weight: 30, profile: 'daytime' },
    { geoapify: 'sport.stadium', key: 'stadium', weight: 40, profile: 'leisure' },
    { geoapify: 'beach', key: 'beach', weight: 25, profile: 'leisure' },
    { geoapify: 'tourism.attraction', key: 'tourist_attraction', weight: 20, profile: 'daytime' },
    { geoapify: 'entertainment.cinema', key: 'cinema', weight: 15, profile: 'leisure' },
    { geoapify: 'religion.place_of_worship', key: 'place_of_worship', weight: 15, profile: 'religious' },
    { geoapify: 'education.university', key: 'university', weight: 15, profile: 'daytime' },
    { geoapify: 'leisure.park', key: 'park', weight: 8, profile: 'leisure' },
  ],

  /**
   * Activity multiplier (0..1) by local hour, per profile, weekday vs weekend. Bands are
   * [from, to) in 24h IST; the first matching band wins.
   */
  profiles: {
    commute: {
      weekday: [[0, 5, 0.1], [5, 7, 0.5], [7, 11, 1.0], [11, 17, 0.55], [17, 21, 1.0], [21, 24, 0.4]],
      weekend: [[0, 5, 0.1], [5, 8, 0.3], [8, 11, 0.6], [11, 17, 0.6], [17, 21, 0.7], [21, 24, 0.35]],
    },
    leisure: {
      weekday: [[0, 6, 0.05], [6, 11, 0.15], [11, 17, 0.4], [17, 22, 0.9], [22, 24, 0.35]],
      weekend: [[0, 6, 0.1], [6, 11, 0.3], [11, 17, 0.8], [17, 23, 1.0], [23, 24, 0.4]],
    },
    daytime: {
      weekday: [[0, 7, 0.05], [7, 9, 0.4], [9, 18, 1.0], [18, 21, 0.4], [21, 24, 0.1]],
      weekend: [[0, 8, 0.05], [8, 11, 0.6], [11, 19, 0.9], [19, 22, 0.4], [22, 24, 0.1]],
    },
    religious: {
      weekday: [[0, 5, 0.05], [5, 9, 0.7], [9, 17, 0.4], [17, 21, 0.9], [21, 24, 0.15]],
      weekend: [[0, 5, 0.05], [5, 9, 0.8], [9, 17, 0.6], [17, 21, 1.0], [21, 24, 0.2]],
    },
  },

  // score = 100 * (1 - exp(-rawCrowd / saturation)); rawCrowd = sum of weight x profile multiplier
  saturation: 60,

  // A place also adds to the surrounding rings: ring k gets decayPerRing^k of its weight (~350 m reach).
  spread: { maxRing: 2, decayPerRing: 0.5 },

  places: {
    perPage: 500,
    maxPages: 6, // per category
    requestTimeoutMs: 20000,
    refreshMs: 24 * 3600 * 1000, // places are re-fetched at most once a day
    // If the cached places are older than this, the crowd component is stamped with the places'
    // age (not "now") so the risk engine ages it and flags it stale.
    maxAgeMs: 3 * 24 * 3600 * 1000,
    // Below this share of categories fetched, the result is flagged lowConfidence.
    minCategoryCoverage: 0.7,
  },

  recomputeIntervalMs: 3600 * 1000, // crowd is recomputed hourly from cached places (no API call)
};
