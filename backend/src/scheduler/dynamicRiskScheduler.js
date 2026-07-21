const weatherService = require('../services/weather/weather.service');
const { getLatestNews } = require('../services/news/news.service');
const { buildNewsRisk } = require('../services/news/newsRisk.service');
const { buildWeatherRisk, buildFloodRisk } = require('../services/weather/floodRisk.service');
const { buildEnvironmentalScore } = require('../utils/environmentalScore');
const h3GridService = require('../services/h3GridService');
const dangerZoneService = require('../services/dangerZoneService');
const DangerZone = require('../models/DangerZone');
const logger = require('../utils/logger');

/**
 * Dynamic Risk Update Service — SafeTours IPD
 *
 * What is happening:
 * This scheduler periodically fetches live weather, flood, and news intelligence, computes updated
 * environmental risk scores, maps coordinates to H3 cells, and updates MongoDB DangerZone documents.
 *
 * Why it is required:
 * Keeps spatial danger zone ratings fresh in the background so mobile users receive accurate real-time
 * safety and environmental risk scores without requiring manual user requests.
 *
 * Which existing services are being reused:
 * - weatherService.getCurrentWeather (OpenWeather API integration)
 * - floodRiskService (buildWeatherRisk & buildFloodRisk calculation logic)
 * - newsService.getLatestNews & newsRiskService.buildNewsRisk (News API & incident keyword matching)
 * - environmentalScore.buildEnvironmentalScore (composite environmental risk scoring engine)
 * - h3GridService (latLngToH3 & getAffectedH3Cells H3 spatial indexing)
 * - dangerZoneService.updateEnvironmentalScore (atomic $set updates in MongoDB DangerZone collection)
 *
 * How it helps frontend integration:
 * Ensures frontend clients querying GET /api/danger-zones or GET /api/environment/score receive
 * pre-computed, up-to-date environmental Scores and accurate refresh timestamps (lastWeatherUpdate, lastNewsUpdate).
 */

// Key target locations across Mumbai for environmental risk polling
const DEFAULT_MONITORED_LOCATIONS = [
  { name: 'Gateway of India', lat: 18.9220, lng: 72.8347 },
  { name: 'Dadar Central', lat: 19.0178, lng: 72.8478 },
  { name: 'Bandra West', lat: 19.0596, lng: 72.8295 },
  { name: 'Andheri East', lat: 19.1136, lng: 72.8697 },
  { name: 'Borivali West', lat: 19.2307, lng: 72.8567 },
  { name: 'Thane West', lat: 19.2183, lng: 72.9781 }
];

/**
 * Executes one cycle of the dynamic risk update process.
 */
async function processDynamicRiskUpdates() {
  logger.info('[dynamicRiskScheduler] Starting periodic dynamic risk update cycle...');

  // --------------------------------------------------------------------------------
  // What is happening: Resolving target location coordinates for environmental scanning.
  // Why it is required: Ensures we scan representative geographical hubs across the city.
  // Which existing service is being reused: Reuses DangerZone model to query hotspot centroids.
  // How it helps frontend integration: Ensures all active danger hotspots receive timely risk refreshes.
  // --------------------------------------------------------------------------------
  let targetLocations = DEFAULT_MONITORED_LOCATIONS;
  try {
    const activeHotspots = await DangerZone.find({})
      .select('hotspotId location')
      .limit(10)
      .lean();

    if (activeHotspots && activeHotspots.length > 0) {
      targetLocations = activeHotspots.map((zone) => ({
        name: `Hotspot #${zone.hotspotId}`,
        lat: zone.location.coordinates[1], // GeoJSON order is [longitude, latitude]
        lng: zone.location.coordinates[0],
      }));
    }
  } catch (err) {
    logger.warn(`[dynamicRiskScheduler] Could not fetch DangerZone centroids, falling back to defaults: ${err.message}`);
  }

  // --------------------------------------------------------------------------------
  // What is happening: Fetching news intelligence once per cycle.
  // Why it is required: Avoids duplicate News API calls per location while capturing city-wide news.
  // Which existing service is being reused: Reuses newsService.getLatestNews & newsRiskService.buildNewsRisk.
  // How it helps frontend integration: Provides city-wide news risk context attached to danger scores.
  // --------------------------------------------------------------------------------
  let newsRisk = { score: 0 };
  let newsArticles = [];
  try {
    newsArticles = await getLatestNews('Mumbai');
    newsRisk = buildNewsRisk({ articles: newsArticles, location: 'Mumbai' });
    logger.info(`[dynamicRiskScheduler] News risk calculated: Score=${newsRisk.score}, MatchedKeywords=${newsRisk.matchedKeywords?.join(', ') || 'None'}`);
  } catch (newsErr) {
    logger.warn(`[dynamicRiskScheduler] News fetch failed gracefully, continuing with zero news risk: ${newsErr.message}`);
  }

  // Iterate over each target location to refresh weather and environmental risk
  let updatedCount = 0;
  for (const loc of targetLocations) {
    try {
      const { lat, lng, name } = loc;

      // --------------------------------------------------------------------------------
      // What is happening: Fetching live weather & computing weather/flood risks.
      // Why it is required: Obtains real-time rainfall, visibility, and wind conditions.
      // Which existing service is being reused: Reuses weatherService.getCurrentWeather & floodRisk.service.
      // How it helps frontend integration: Updates weatherScore accurately per location.
      // --------------------------------------------------------------------------------
      const weatherData = await weatherService.getCurrentWeather(lat, lng);
      const weatherRisk = buildWeatherRisk(weatherData);
      const floodRisk = buildFloodRisk(weatherData);

      // --------------------------------------------------------------------------------
      // What is happening: Calculating composite environmental risk score.
      // Why it is required: Blends weather, flood, and news risks into one standard 0-100 score.
      // Which existing service is being reused: Reuses environmentalScore.buildEnvironmentalScore.
      // How it helps frontend integration: Ensures consistent environmental risk score calculation.
      // --------------------------------------------------------------------------------
      const scoreObj = buildEnvironmentalScore({ weatherRisk, floodRisk, newsRisk });
      const weatherScore = weatherRisk.score || 0;
      const environmentalScoreVal = scoreObj.environmentalScore || 0;

      // --------------------------------------------------------------------------------
      // What is happening: Converting coordinates into H3 index cells and calculating radius.
      // Why it is required: Maps geographic points to H3 spatial grid cells.
      // Which existing service is being reused: Reuses h3GridService.latLngToH3 & getAffectedH3Cells.
      // How it helps frontend integration: Ensures risk is indexed by H3 hexagon for fast map rendering.
      // --------------------------------------------------------------------------------
      const h3Index = h3GridService.latLngToH3(lat, lng, 9);
      const affectedRadiusInKm = weatherRisk.score >= 50 ? 1.0 : 0;
      const affectedH3Cells = affectedRadiusInKm > 0
        ? h3GridService.getAffectedH3Cells(lat, lng, affectedRadiusInKm, 9)
        : [h3Index];

      // --------------------------------------------------------------------------------
      // What is happening: Persisting updated risk scores to MongoDB using atomic $set.
      // Why it is required: Merge safety; modifies ONLY weatherScore, environmentalScore, timestamps.
      // Which existing service is being reused: Reuses dangerZoneService.updateEnvironmentalScore.
      // How it helps frontend integration: Updates DangerZone without overwriting crime/crowd scores.
      // --------------------------------------------------------------------------------
      const updatedZones = await dangerZoneService.updateEnvironmentalScore(
        lat,
        lng,
        weatherScore,
        environmentalScoreVal,
        h3Index,
        affectedH3Cells
      );

      updatedCount += updatedZones.length;
      logger.info(`[dynamicRiskScheduler] Location '${name}' (${lat}, ${lng}) updated ${updatedZones.length} DangerZones in H3 cell ${h3Index}.`);
    } catch (locErr) {
      logger.error(`[dynamicRiskScheduler] Error updating location '${loc.name}': ${locErr.message}`);
      // Continue processing remaining locations
    }
  }

  logger.info(`[dynamicRiskScheduler] Dynamic risk update cycle completed. Total DangerZone updates: ${updatedCount}.`);
}

/**
 * Initializes and starts the background Dynamic Risk Update scheduler.
 *
 * @param {number} [customIntervalMs] - Optional override for interval in milliseconds.
 * @returns {Object} Interval timer reference.
 */
function startDynamicRiskScheduler(customIntervalMs = null) {
  // Read interval from environment variables (fallback: 15 minutes = 900,000 ms)
  const envInterval = process.env.DYNAMIC_RISK_REFRESH_INTERVAL || process.env.WEATHER_REFRESH_INTERVAL;
  const intervalMs = customIntervalMs || (envInterval ? Number(envInterval) : 15 * 60 * 1000);

  logger.info(`[dynamicRiskScheduler] Starting Dynamic Risk Update Scheduler (Interval: ${intervalMs / 1000}s)...`);

  // Run immediate initial execution
  processDynamicRiskUpdates().catch((err) => {
    logger.error('[dynamicRiskScheduler] Initial execution failed:', err);
  });

  const intervalId = setInterval(async () => {
    try {
      await processDynamicRiskUpdates();
    } catch (err) {
      logger.error('[dynamicRiskScheduler] Periodic execution error:', err);
    }
  }, intervalMs);

  return intervalId;
}

module.exports = {
  processDynamicRiskUpdates,
  startDynamicRiskScheduler,
};
