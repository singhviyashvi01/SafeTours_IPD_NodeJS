const dangerZoneService = require('../services/dangerZoneService');
const ApiError = require('../utils/apiError');

/**
 * DangerZone Controller — SafeTours IPD
 *
 * Purpose of this file:
 * Own the HTTP layer for the Crime Intelligence module.
 * Each function reads from req, delegates ALL business logic and DB work to
 * dangerZoneService, then shapes and sends the JSON response.
 *
 * What this file deliberately does NOT do:
 * - Touch the database directly (that is the service's responsibility).
 * - Contain coordinate validation logic (handled by dangerZoneValidator.js middleware).
 *
 * Error handling:
 * Every handler wraps its work in try/catch and calls next(error) so the
 * global errorMiddleware produces a consistent error shape for every failure.
 */

// ─── GET /api/danger-zones ────────────────────────────────────────────────────

/**
 * What this code is doing:
 * Handles GET /api/danger-zones. If minLat, maxLat, minLng, maxLng query params are provided,
 * it returns DangerZones inside that bounding box. Otherwise, returns all DangerZone documents.
 * Why it is needed:
 * Allows the frontend map to efficiently query only visible DangerZone hexagons inside the current map viewport.
 * Which existing module is being reused:
 * Reuses dangerZoneService.getDangerZonesInBoundingBox and dangerZoneService.getAllDangerZones.
 * How the frontend consumes this API:
 * Called by frontend map views when rendering or panning the map screen.
 */
const getAllDangerZones = async (req, res, next) => {
  try {
    const { minLat, maxLat, minLng, maxLng } = req.query;

    let zones;
    let message;

    if (minLat !== undefined && maxLat !== undefined && minLng !== undefined && maxLng !== undefined) {
      zones = await dangerZoneService.getDangerZonesInBoundingBox(minLat, maxLat, minLng, maxLng);
      message = 'Danger zones within bounding box retrieved successfully.';
    } else {
      zones = await dangerZoneService.getAllDangerZones();
      message = 'All danger zones retrieved successfully.';
    }

    return res.status(200).json({
      success: true,
      message,
      count: zones.length,
      data: zones,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * What this code is doing:
 * Handles GET /api/danger-zones/nearby?lat=&lng=&radius=. Return nearby DangerZones within radius.
 * Why it is needed:
 * Allows mobile users to query danger zones surrounding their current coordinates within a specified radius.
 * Which existing module is being reused:
 * Reuses dangerZoneService.getDangerZonesNearby and dangerZoneService.getNearestDangerZone.
 * How the frontend consumes this API:
 * Called by location tracking screens to display proximity safety alerts.
 */
const getNearbyDangerZone = async (req, res, next) => {
  try {
    const { lat, lng, radius } = req.query;

    if (radius !== undefined && radius !== '') {
      const radiusMeters = Number(radius);
      const zones = await dangerZoneService.getDangerZonesNearby(lat, lng, radiusMeters);

      return res.status(200).json({
        success: true,
        message: `Nearby danger zones within ${radiusMeters}m retrieved successfully.`,
        count: zones.length,
        data: zones,
      });
    }

    const zone = await dangerZoneService.getNearestDangerZone(lat, lng);

    if (!zone) {
      throw new ApiError(404, 'No danger zones found in the database.');
    }

    return res.status(200).json({
      success: true,
      message: 'Nearest danger zone retrieved successfully.',
      data: {
        distanceInMeters: Math.round(zone.distanceInMeters),
        zone,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * What this code is doing:
 * Handles GET /api/danger-zones/crime-score?lat=&lng=.
 * Why it is needed:
 * Surfaces crime score and risk level summary for immediate real-time location coloring.
 * Which existing module is being reused:
 * Reuses dangerZoneService.getCrimeScoreForLocation.
 * How the frontend consumes this API:
 * Called by main dashboard to color-code user location badge.
 */
const getCrimeScore = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    const result = await dangerZoneService.getCrimeScoreForLocation(lat, lng);

    if (!result) {
      throw new ApiError(404, 'No danger zones found in the database.');
    }

    return res.status(200).json({
      success: true,
      message: 'Crime score retrieved successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * What this code is doing:
 * Handles GET /api/danger-zones/:h3Index. Retrieves complete stored details of one H3 cell.
 * Why it is needed:
 * Allows frontend to display a detail drawer when a user clicks on an H3 hexagon on the map.
 * Which existing module is being reused:
 * Reuses dangerZoneService.getDangerZoneByH3Index (read-only MongoDB lookup).
 * How the frontend consumes this API:
 * Called by frontend map when an H3 hexagon cell is tapped.
 */
const getDangerZoneByH3Index = async (req, res, next) => {
  try {
    const { h3Index } = req.params;

    const zone = await dangerZoneService.getDangerZoneByH3Index(h3Index);

    if (!zone) {
      throw new ApiError(404, `DangerZone or H3 cell '${h3Index}' not found in the database.`);
    }

    return res.status(200).json({
      success: true,
      message: `H3 cell '${h3Index}' details retrieved successfully.`,
      data: zone,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * What this code is doing:
 * Handles GET /api/danger-zones/location-risk?lat=&lng=.
 * Why it is needed:
 * Surfaces the safety metrics (crime, weather, EWS scores, total risk, and level) for the user's resolved location cell.
 * Which existing module is being reused:
 * Reuses dangerZoneService.getLocationRisk and project-wide ApiError.
 * How the frontend consumes this API:
 * Called by location widgets or maps to query safety details dynamically.
 */
const getLocationRisk = async (req, res, next) => {
  try {
    const { lat, lng } = req.query;

    const result = await dangerZoneService.getLocationRisk(lat, lng);

    if (!result) {
      throw new ApiError(404, `No DangerZone or H3 cell found for location [${lat}, ${lng}].`);
    }

    return res.status(200).json({
      success: true,
      message: 'Location risk details retrieved successfully.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllDangerZones,
  getNearbyDangerZone,
  getCrimeScore,
  getDangerZoneByH3Index,
  getLocationRisk,
};
