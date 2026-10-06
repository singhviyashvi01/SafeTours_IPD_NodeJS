const locationService = require('../services/locationService');
const journeyService = require('../services/journeyService');
const logger = require('../utils/logger');

/**
 * Handles incoming requests to sync a new location point.
 * Expects the payload to already be validated by middleware.
 */
const syncLocation = async (req, res) => {
  try {
    // Assuming an auth middleware (e.g., JWT) has attached the user object to the request
    const userId = req.user._id; 
    const locationData = req.body;

    // The controller delegates ALL database logic to the Service Layer
    const savedLocation = await locationService.saveLocation(userId, locationData);

    // Shadow Mode: remember the last known position and detect arrival. Only fresh readings count:
    // a point replayed from an offline queue says nothing about where the user is now.
    const ageMs = Date.now() - new Date(locationData.timestamp || Date.now()).getTime();
    if (ageMs <= 10 * 60 * 1000) {
      journeyService
        .checkArrival(userId, { latitude: locationData.latitude, longitude: locationData.longitude, accuracy: locationData.accuracy })
        .catch((e) => logger.error('[location] arrival check failed', e));
    }

    // Return a 201 Created status for successful resource creation
    return res.status(201).json({
      success: true,
      message: 'Location synchronized successfully.',
      data: savedLocation,
    });
  } catch (error) {
    // Return a 500 Internal Server Error if the Service Layer throws an exception
    return res.status(500).json({
      success: false,
      message: 'An error occurred while synchronizing location.',
      error: error.message,
    });
  }
};

/**
 * POST /api/location/batch: points recorded while offline (idempotent per point).
 * Arrival detection only looks at the newest point, and only when it is fresh: a replayed point says nothing
 * about where the user is now.
 */
const syncLocationBatch = async (req, res) => {
  try {
    const out = await locationService.saveBatch(req.user._id, req.body.points);
    if (out.newest && Date.now() - new Date(out.newest.timestamp).getTime() <= 10 * 60 * 1000) {
      journeyService
        .checkArrival(req.user._id, { latitude: out.newest.latitude, longitude: out.newest.longitude, accuracy: out.newest.accuracy })
        .catch((e) => logger.error('[location] arrival check failed', e));
    }
    return res.status(200).json({
      success: true,
      message: `Stored ${out.inserted} of ${out.received} points (${out.duplicates} already stored, ${out.rejected.length} rejected).`,
      data: { received: out.received, inserted: out.inserted, duplicates: out.duplicates, rejected: out.rejected },
    });
  } catch (error) {
    logger.error('[location] batch failed', error);
    return res.status(500).json({ success: false, message: 'An error occurred while storing the location batch.', error: error.message });
  }
};

/**
 * Handles incoming requests to retrieve the user's most recent location.
 */
const getLatestLocation = async (req, res) => {
  try {
    const userId = req.user.id;

    // Delegate fetching logic to the Service Layer
    const latestLocation = await locationService.getLatestLocation(userId);

    // If the service returns null, the user has never synced a location
    if (!latestLocation) {
      return res.status(200).json({
        success: true,
        message: 'No location history found for this user.',
        location: null,
      });
    }

    // Return a 200 OK status with the retrieved data
    return res.status(200).json({
      success: true,
      message: 'Latest location retrieved successfully.',
      location: latestLocation,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the latest location.',
      error: error.message,
    });
  }
};

module.exports = {
  syncLocation,
  syncLocationBatch,
  getLatestLocation,
};
