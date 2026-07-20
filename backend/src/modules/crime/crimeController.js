const crimeGridService = require('./crimeGridService');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/apiError');

/**
 * Crime Controller — SafeTours IPD
 *
 * Responsibilities:
 * - Receive HTTP request to map hotspots
 * - Delegate to crimeGridService
 * - Format and return standard API response
 */

/**
 * POST /api/crime/map-hotspots
 *
 * Maps an array of crime hotspots (polygons and scores) to the H3 Grid
 * and updates the corresponding GridCell documents in MongoDB.
 *
 * Input:
 * {
 *   hotspots: [
 *     { polygon: [[lat, lng], [lat, lng], ...], crimeScore: 45 }
 *   ]
 * }
 */
const mapHotspots = async (req, res, next) => {
  try {
    const { hotspots } = req.body;

    logger.info(`[CrimeController.mapHotspots] Received request to map ${hotspots.length} hotspots.`);

    const updatedCells = await crimeGridService.mapHotspotsToGrid(hotspots);

    return res.status(200).json({
      success: true,
      message: 'Hotspots mapped to H3 grid successfully.',
      updatedCells,
    });
  } catch (error) {
    logger.error('[CrimeController.mapHotspots] Error mapping hotspots.', error);
    // Let the global error handler catch and format this
    next(new ApiError(500, 'Failed to map hotspots to grid.'));
  }
};

module.exports = {
  mapHotspots,
};
