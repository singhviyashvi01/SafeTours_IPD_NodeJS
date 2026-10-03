/**
 * weather.config.js: tunables of the weather component (services/weather, scheduler/weatherScheduler.js).
 *
 * Quota design: OpenWeather is called for the sample points below (12 requests per refresh, every
 * 30 minutes = 576 requests/day), never per cell or per user. Cell values are interpolated from the
 * samples (inverse-distance weighting), so the risk map still varies across the city.
 */
module.exports = {
  // Coarse spread over Mumbai (approximate coordinates of well-known localities).
  samplePoints: [
    { name: 'Colaba', lat: 18.9067, lng: 72.8147 },
    { name: 'Fort/CSMT', lat: 18.9402, lng: 72.8356 },
    { name: 'Worli', lat: 19.0176, lng: 72.818 },
    { name: 'Dadar', lat: 19.0178, lng: 72.8478 },
    { name: 'Bandra', lat: 19.0596, lng: 72.8295 },
    { name: 'Kurla/BKC', lat: 19.0726, lng: 72.8845 },
    { name: 'Chembur', lat: 19.0522, lng: 72.9005 },
    { name: 'Andheri', lat: 19.1197, lng: 72.8464 },
    { name: 'Powai', lat: 19.1176, lng: 72.906 },
    { name: 'Goregaon', lat: 19.1663, lng: 72.8526 },
    { name: 'Mulund', lat: 19.1726, lng: 72.9425 },
    { name: 'Borivali', lat: 19.2307, lng: 72.8567 },
  ],

  // Inverse-distance weighting of the nearest samples; cells farther than maxDistanceMeters from every
  // usable sample get no weather value (missing, not guessed).
  interpolation: { neighbours: 3, power: 2, maxDistanceMeters: 15000 },

  /**
   * Hazard curves: [value, score 0-100] points, linearly interpolated, clamped at the ends.
   * Rain follows the usual hourly-intensity classes (drizzle .. extreme); visibility is in metres
   * (lower = worse); wind is the larger of sustained speed and gust, m/s; temperature is "feels like".
   */
  curves: {
    rainMmPerHour: [[0, 0], [0.5, 5], [2.5, 20], [7.5, 45], [15, 65], [35, 85], [65, 100]],
    visibilityMeters: [[200, 100], [500, 75], [1000, 50], [2000, 30], [5000, 10], [10000, 0]],
    windMs: [[8, 0], [12, 20], [17, 50], [25, 80], [33, 100]],
    heatFeelsLikeC: [[35, 0], [38, 25], [41, 50], [45, 90], [48, 100]],
    coldFeelsLikeC: [[0, 50], [5, 20], [10, 0]],
  },

  // OpenWeather condition ids that imply a minimum score (thunderstorm family, squall, tornado).
  // Note: official storm/cyclone ALERTS need OpenWeather One Call 3.0 (paid plan with a card on file);
  // they are not used. The condition id of the current-weather response is the available proxy.
  conditionFloors: {
    200: 55, 201: 65, 202: 80, 210: 55, 211: 65, 212: 80, 221: 65, 230: 55, 231: 60, 232: 70,
    771: 70, 781: 100,
  },

  // Overall score = strongest hazard + compoundWeight x second strongest (capped at 100).
  compoundWeight: 0.3,

  /**
   * Flood-prone boost: ONLY applied when you provide real data. Put a JSON array of H3 res-9 indexes
   * of known flood-prone cells (e.g. derived from BMC flood-spot lists) at floodProneFile. Without that
   * file there is no flood boost, and heavy rain simply scores high everywhere. When a cell is in the
   * file and rain score >= minRainScore: score += boostPoints x rainScore / 100.
   */
  floodProne: { file: 'data/flood-prone-cells.json', boostPoints: 15, minRainScore: 20 },

  cache: { freshMs: 10 * 60 * 1000, maxStaleMs: 3 * 3600 * 1000 },
  requestTimeoutMs: 10000,
  refreshMs: 30 * 60 * 1000,
};
