const geofenceService = require('./geofence.service');
const ApiError = require('../../utils/apiError');

/**
 * Geofence Controller — SafeTours IPD
 *
 * Controls HTTP request/response flow for the Geofence Detection Engine,
 * live monitoring status, event history, and offline location batch sync.
 */

/**
 * POST /api/geofence/check
 */
const checkGeofence = async (req, res, next) => {
  try {
    const { latitude, longitude, userId: bodyUserId } = req.body;

    // Extract authenticated user ID, or fallback to bodyUserId if provided for testing
    const userId = req.user?._id || req.user?.id || bodyUserId;

    if (!userId) {
      throw new ApiError(400, 'User authentication or userId parameter is required for geofence check.');
    }

    const result = await geofenceService.checkGeofence(userId, latitude, longitude);

    return res.status(200).json({
      success: true,
      event: result.event,
      insideDangerZone: result.insideDangerZone,
      riskLevel: result.riskLevel,
      totalRisk: result.totalRisk,
      zoneId: result.zoneId,
      previousZone: result.previousZone,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/geofence/sync
 * Performs offline batch synchronization for multiple stored GPS points.
 */
const syncGeofenceLocations = async (req, res, next) => {
  try {
    const { locations, userId: bodyUserId } = req.body;
    const userId = req.user?._id || req.user?.id || bodyUserId;

    if (!userId) {
      throw new ApiError(400, 'User authentication or userId parameter is required for geofence batch sync.');
    }

    if (!Array.isArray(locations) || locations.length === 0) {
      throw new ApiError(400, 'Locations array is required and cannot be empty.');
    }

    const result = await geofenceService.syncOfflineLocations(userId, locations);

    return res.status(200).json({
      success: true,
      message: `Offline location sync completed. Processed ${result.processedCount} points, generated ${result.eventsGenerated} events.`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/geofence/status
 */
const getGeofenceStatus = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id || req.query.userId;

    if (!userId) {
      throw new ApiError(400, 'User authentication or userId parameter is required to retrieve geofence status.');
    }

    const status = await geofenceService.getGeofenceStatus(userId);

    return res.status(200).json({
      success: true,
      message: 'Geofence status retrieved successfully.',
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/geofence/history
 */
const getGeofenceHistory = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id || req.query.userId;

    if (!userId) {
      throw new ApiError(400, 'User authentication or userId parameter is required to retrieve geofence history.');
    }

    const history = await geofenceService.getGeofenceHistory(userId);

    return res.status(200).json({
      success: true,
      message: 'Geofence history events retrieved successfully.',
      count: history.length,
      data: history,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  checkGeofence,
  syncGeofenceLocations,
  getGeofenceStatus,
  getGeofenceHistory,
};
