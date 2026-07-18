const locationService = require('../services/locationService');

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
  getLatestLocation,
};
