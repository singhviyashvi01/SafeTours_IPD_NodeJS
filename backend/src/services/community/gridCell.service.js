const h3 = require('h3-js');
const GridCell = require('../../models/GridCell');
const Incident = require('../../models/Incident');
const dangerZoneService = require('../dangerZoneService');
const { incidentCategories } = require('../../config/communityConfig');
const riskEngineService = require('../riskEngine.service');
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
 * Perform background fetches for risk scores to update the grid cell cache.
 * Now simply calls Python score-service which handles weather, news, etc.
 */
async function updateDynamicScoresInBackground(h3CellId, lat, lng) {
  try {
    const activeIncidents = await Incident.find({
      h3CellId,
      status: 'ACTIVE',
    });

    const communityReports = activeIncidents.map((inc) => ({
      severity: inc.severity === 'CRITICAL' ? 5 : inc.severity === 'HIGH' ? 4 : inc.severity === 'MEDIUM' ? 3 : inc.severity === 'LOW' ? 2 : 1,
      timestamp: inc.createdAt.toISOString(),
      verified: inc.confirmationCount > 0,
    }));

    const cell = await GridCell.findOne({ $or: [{ h3Index: h3CellId }, { h3CellId }] });
    if (cell) {
      const riskResult = await riskEngineService.calculateRisk({
        lat,
        lng,
        crowdCount: 0,
        communityReports,
      });

      cell.weatherScore = riskResult.breakdown.weather;
      cell.crowdScore = riskResult.breakdown.crowd;
      cell.newsScore = riskResult.breakdown.news;
      cell.totalRiskScore = riskResult.totalRiskScore;
      cell.level = riskResult.level;
      await cell.save();
      logger.info(`[GridCellService.background] Updated dynamic scores for cell ${h3CellId}: TotalRisk=${riskResult.totalRiskScore}, Level=${riskResult.level}`);
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

      const communityReports = activeIncidents.map((inc) => ({
        severity: inc.severity === 'CRITICAL' ? 5 : inc.severity === 'HIGH' ? 4 : inc.severity === 'MEDIUM' ? 3 : inc.severity === 'LOW' ? 2 : 1,
        timestamp: inc.createdAt.toISOString(),
        verified: inc.confirmationCount > 0,
      }));

      // 6. Calculate composite risk score via Python Risk Engine
      const riskResult = await riskEngineService.calculateRisk({
        lat,
        lng,
        crowdCount: 0,
        communityReports,
      });

      const existingCell = await GridCell.findOne({ $or: [{ h3Index: h3CellId }, { h3CellId }] });

      // 7. Upsert GridCell cache with normalized totalRiskScore and risk level
      const updatedCell = await GridCell.findOneAndUpdate(
        { h3CellId },
        {
          h3CellId,
          crimeScore: riskResult.breakdown.crime,
          crowdScore: riskResult.breakdown.crowd,
          weatherScore: riskResult.breakdown.weather,
          newsScore: riskResult.breakdown.news,
          communityScore: riskResult.breakdown.community,
          ewsScore: existingCell ? (existingCell.ewsScore || 0) : 0,
          totalRiskScore: riskResult.totalRiskScore,
          level: riskResult.level,
        },
        { upsert: true, new: true }
      );

      logger.info(`[GridCellService] Recalculated cell ${h3CellId}: TotalRisk=${riskResult.totalRiskScore}, Level=${riskResult.level}`);

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
