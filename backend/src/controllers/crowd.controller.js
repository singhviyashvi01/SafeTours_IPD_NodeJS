const { fetchNearbyPlaces } = require('../services/crowd/geoapify.service');
const { calculateCrowdScore } = require('../services/crowd/crowdScore.service');
const ApiError = require('../utils/apiError');

/**
 * Purpose of this controller:
 * Validate incoming requests for the crowd intelligence module and return front-end ready
 * JSON payloads for crowd score and level estimates.
 *
 * Why this exists:
 * The route layer stays lightweight while the controller remains the single place where
 * request validation and response shaping happen for this module.
 */

/**
 * Purpose of this function:
 * Validate coordinates input format and range before processing by service layers.
 * Input:
 * Object containing lat and lng fields.
 * Output:
 * Object with numeric latitude and longitude.
 */
const validateCoordinates = ({ lat, lng }) => {
  const latitude = Number(lat);
  const longitude = Number(lng);

  if (!Number.isFinite(latitude)) {
    throw new ApiError(400, 'Latitude must be a valid number.');
  }

  if (!Number.isFinite(longitude)) {
    throw new ApiError(400, 'Longitude must be a valid number.');
  }

  if (latitude < -90 || latitude > 90) {
    throw new ApiError(400, 'Latitude must be between -90 and 90.');
  }

  if (longitude < -180 || longitude > 180) {
    throw new ApiError(400, 'Longitude must be between -180 and 180.');
  }

  return { latitude, longitude };
};

/**
 * Purpose of this function:
 * Handle requests to compute crowd density score for specified coordinates.
 * Why it is needed:
 * Resolves request coordinates, orchestrates call to geoapify places search,
 * invokes scoring logic, and returns formatted JSON response.
 */
const getCrowdScore = async (req, res, next) => {
  try {
    const { lat, lng, radius } = req.query;

    if (lat === undefined || lat === '') {
      throw new ApiError(400, 'Latitude is required.');
    }
    if (lng === undefined || lng === '') {
      throw new ApiError(400, 'Longitude is required.');
    }

    const { latitude, longitude } = validateCoordinates({ lat, lng });
    const searchRadius = radius ? Number(radius) : 1000;

    // Fetch places from Geoapify integration
    const places = await fetchNearbyPlaces(latitude, longitude, searchRadius);

    // Compute crowd intelligence score and breakdown
    const crowdData = calculateCrowdScore(places);

    return res.status(200).json({
      success: true,
      message: 'Crowd score retrieved successfully.',
      data: {
        crowdScore: crowdData.crowdScore,
        crowdLevel: crowdData.crowdLevel,
        nearbyPlaces: crowdData.nearbyPlaces,
        scoreBreakdown: crowdData.scoreBreakdown
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCrowdScore,
};
