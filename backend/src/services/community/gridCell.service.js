const h3 = require('h3-js');
const GridCell = require('../../models/GridCell');
const Incident = require('../../models/Incident');
const dangerZoneService = require('../dangerZoneService');
const weatherService = require('../weather/weather.service');
const { buildWeatherRisk } = require('../weather/floodRisk.service');
const { fetchNearbyPlaces } = require('../crowd/geoapify.service');
const { calculateCrowdScore } = require('../crowd/crowdScore.service');
const { getLatestNews } = require('../news/news.service');
const { buildNewsRisk } = require('../news/newsRisk.service');
const { incidentCategories } = require('../../config/communityConfig');
const logger = require('../../utils/logger');

// Defensive helper to convert lat/lng to H3 index in both v3 and v4 of h3-js
function latLngToH3(latitude, longitude, resolution = 9) {
  if (typeof h3.latLngToCell === 'function') {
    return h3.latLngToCell(latitude, longitude, resolution);
  } else if (typeof h3.geoToH3 === 'function') {
    return h3.geoToH3(latitude, longitude, resolution);
  }
  throw new Error('H3 library does not support latLngToCell or geoToH3');
}

// Defensive helper to convert H3 cell to lat/lng in both v3 and v4 of h3-js
function h3ToLatLng(h3CellId) {
  if (typeof h3.cellToLatLng === 'function') {
    return h3.cellToLatLng(h3CellId);
  } else if (typeof h3.h3ToGeo === 'function') {
    return h3.h3ToGeo(h3CellId);
  }
  throw new Error('H3 library does not support cellToLatLng or h3ToGeo');
}

/**
 * Perform background fetches for weather, crowd, and news scores to update the grid cell cache.
 */
async function updateDynamicScoresInBackground(h3CellId, lat, lng) {
  try {
    // 1. Fetch weather risk
    let weatherScore = 0;
    try {
      const weatherData = await weatherService.getCurrentWeather(lat, lng);
      const weatherRisk = buildWeatherRisk(weatherData);
      weatherScore = Number(weatherRisk.score || 0);
    } catch (err) {
      logger.warn(`[GridCellService.background] Weather fetch failed for H3 cell ${h3CellId}: ${err.message}`);
    }

    // 2. Fetch crowd risk
    let crowdScore = 0;
    try {
      const places = await fetchNearbyPlaces(lat, lng, 1000);
      const crowdData = calculateCrowdScore(places);
      crowdScore = Number(crowdData.crowdScore || 0);
    } catch (err) {
      logger.warn(`[GridCellService.background] Crowd fetch failed for H3 cell ${h3CellId}: ${err.message}`);
    }

    // 3. Fetch news risk
    let newsScore = 0;
    try {
      // Default to "Mumbai" or a general local name for news keyword matching
      const articles = await getLatestNews('Mumbai');
      const newsRisk = buildNewsRisk({ articles, location: 'Mumbai' });
      newsScore = Number(newsRisk.score || 0);
    } catch (err) {
      logger.warn(`[GridCellService.background] News fetch failed for H3 cell ${h3CellId}: ${err.message}`);
    }

    // 4. Update the GridCell record in Mongoose
    const cell = await GridCell.findOne({ h3CellId });
    if (cell) {
      cell.weatherScore = weatherScore;
      cell.crowdScore = crowdScore;
      cell.newsScore = newsScore;
      cell.totalRiskScore = Math.min(
        500,
        cell.crimeScore + cell.communityScore + crowdScore + weatherScore + newsScore
      );
      await cell.save();
      logger.info(`[GridCellService.background] Updated dynamic scores for cell ${h3CellId}: Weather=${weatherScore}, Crowd=${crowdScore}, News=${newsScore}`);
    }
  } catch (err) {
    logger.error(`[GridCellService.background] Unexpected background update failure for cell ${h3CellId}`, err);
  }
}

/**
 * Service to manage H3 grid cell composite scoring.
 */
class GridCellService {
  /**
   * Recalculates the composite risk score of a single H3 cell.
   *
   * @param {string} h3CellId - The H3 cell index to update.
   * @param {number} [optLat] - Optional exact latitude.
   * @param {number} [optLng] - Optional exact longitude.
   * @returns {Promise<Object>} The updated GridCell document.
   */
  async recalculateGridCellScore(h3CellId, optLat, optLng) {
    try {
      // 1. Get cell coordinates (fall back to cell center if not provided)
      let lat = optLat;
      let lng = optLng;
      if (lat === undefined || lng === undefined) {
        const [h3Lat, h3Lng] = h3ToLatLng(h3CellId);
        lat = h3Lat;
        lng = h3Lng;
      }

      // 2. Fetch all ACTIVE incidents in this cell
      const activeIncidents = await Incident.find({
        h3CellId,
        status: 'ACTIVE',
      });

      // 3. Compute community score
      let totalCommunityScore = 0;
      activeIncidents.forEach((incident) => {
        const category = incidentCategories[incident.incidentType] || { weight: 5 };
        const baseWeight = category.weight;
        const confirmBonus = Math.min(10, incident.confirmationCount) * 3;
        const falseDeduction = incident.falseReportCount * 5;
        const incidentScore = Math.max(0, baseWeight + confirmBonus - falseDeduction);
        totalCommunityScore += incidentScore;
      });

      // Cap community score at 100
      const communityScore = Math.min(100, totalCommunityScore);

      // 4. Retrieve Crime Score (fast local query)
      let crimeScore = 0;
      try {
        const result = await dangerZoneService.getCrimeScoreForLocation(lat, lng);
        crimeScore = result ? Number(result.crimeScore || 0) : 0;
      } catch (err) {
        logger.warn(`[GridCellService] Crime score fetch failed for H3 cell ${h3CellId}: ${err.message}`);
      }

      // 5. Retrieve cached dynamic scores (Crowd, Weather, News) if available
      const existingCell = await GridCell.findOne({ h3CellId });
      const crowdScore = existingCell ? existingCell.crowdScore : 0;
      const weatherScore = existingCell ? existingCell.weatherScore : 0;
      const newsScore = existingCell ? existingCell.newsScore : 0;

      // 6. Calculate composite total risk score
      const totalRiskScore = Math.min(
        500,
        crimeScore + crowdScore + weatherScore + newsScore + communityScore
      );

      // 7. Upsert GridCell cache
      const updatedCell = await GridCell.findOneAndUpdate(
        { h3CellId },
        {
          h3CellId,
          crimeScore,
          crowdScore,
          weatherScore,
          newsScore,
          communityScore,
          totalRiskScore,
        },
        { upsert: true, new: true }
      );

      logger.info(`[GridCellService] Recalculated cell ${h3CellId}: Crime=${crimeScore}, Community=${communityScore}, Total=${totalRiskScore}`);

      // 8. Fire background worker to fetch dynamic API scores if they are missing
      // or to refresh them periodically.
      const shouldUpdateDynamic = !existingCell || (Date.now() - new Date(existingCell.updatedAt).getTime() > 30 * 60 * 1000);
      if (shouldUpdateDynamic) {
        updateDynamicScoresInBackground(h3CellId, lat, lng).catch((err) => {
          logger.error(`[GridCellService] Background update worker failed for cell ${h3CellId}`, err);
        });
      }

      return updatedCell;
    } catch (error) {
      logger.error(`[GridCellService] Failed to recalculate score for H3 cell ${h3CellId}`, error);
      throw error;
    }
  }

  /**
   * Helper to expose the conversion functions.
   */
  latLngToH3(latitude, longitude, resolution = 9) {
    return latLngToH3(latitude, longitude, resolution);
  }
}

module.exports = new GridCellService();
