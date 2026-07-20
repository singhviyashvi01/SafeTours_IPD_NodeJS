const { fetchNearbyPlaces } = require('../services/crowd/geoapify.service');
const { calculateCrowdScore } = require('../services/crowd/crowdScore.service');
const h3GridService = require('../services/h3GridService');
const dangerZoneService = require('../services/dangerZoneService');
const ApiError = require('../utils/apiError');

/**
 * Purpose of this controller:
 * Validate incoming requests for the crowd intelligence module, compute H3 index,
 * calculate crowd density score, update the DangerZone MongoDB document using $set,
 * and return front-end ready JSON payloads.
 *
 * Why this exists:
 * Keeps HTTP layer thin while orchestrating H3 conversion, Geoapify places search,
 * crowd scoring, and atomic DangerZone database updates.
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
 * Handle requests to compute crowd density score for specified coordinates and update DangerZone.
 *
 * What the code is doing:
 * Resolves request coordinates, converts lat/lng to H3 index via Phase 1 H3 Engine,
 * fetches nearby places via Geoapify, calculates crowd score using time/festival logic,
 * and updates ONLY crowdScore inside the existing DangerZone MongoDB document via $set.
 * Why it is required:
 * Implements Phase 3 Crowd Module requirement to map coordinates to H3 index and update DangerZone.
 * Which existing Phase 1 or Phase 2 implementation is being reused:
 * Reuses Phase 1 H3 Engine (h3GridService.latLngToH3) and Phase 2 DangerZone model (dangerZoneService.updateCrowdScore).
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

    // What the code is doing: Convert coordinates to H3 index using Phase 1 H3 Engine.
    // Why it is required: Provides spatial index for crowd intelligence.
    // Reuses: Phase 1 h3GridService.latLngToH3
    const h3Index = h3GridService.latLngToH3(latitude, longitude);

    // Fetch places from Geoapify integration
    const places = await fetchNearbyPlaces(latitude, longitude, searchRadius);

    // Compute crowd intelligence score and breakdown
    const crowdData = calculateCrowdScore(places);

    // What the code is doing: Update ONLY crowdScore inside existing DangerZone document using $set.
    // Why it is required: Merge safety; prevents overwriting crime, weather, or infra scores.
    // Reuses: Phase 2 DangerZone collection & dangerZoneService
    const updatedDangerZone = await dangerZoneService.updateCrowdScore(
      latitude,
      longitude,
      crowdData.crowdScore,
      h3Index
    );

    return res.status(200).json({
      success: true,
      message: 'Crowd score retrieved and DangerZone updated successfully.',
      data: {
        h3Index,
        crowdScore: crowdData.crowdScore,
        crowdLevel: crowdData.crowdLevel,
        nearbyPlaces: crowdData.nearbyPlaces,
        scoreBreakdown: crowdData.scoreBreakdown,
        updatedDangerZone,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCrowdScore,
};
