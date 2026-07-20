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
 * Purpose of this handler:
 * Return all DangerZone documents from MongoDB, sorted by Crime Score
 * descending (most dangerous first) so the mobile map can render all hotspots
 * in a single request.
 *
 * Why no auth guard:
 * Crime hotspot data is static, read-only, and not user-sensitive.
 * Keeping it public lets the app fetch zones before the user logs in
 * (e.g. on the splash screen map view).
 *
 * Input  : none
 * Output : { success, message, count, data: [ DangerZone… ] }
 */
const getAllDangerZones = async (req, res, next) => {
  try {
    const zones = await dangerZoneService.getAllDangerZones();

    return res.status(200).json({
      success: true,
      message: 'All danger zones retrieved successfully.',
      count: zones.length,
      data: zones,
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/danger-zones/nearby?lat=&lng= ───────────────────────────────────

/**
 * Purpose of this handler:
 * Return the single nearest DangerZone to the supplied coordinates using
 * the MongoDB 2dsphere geospatial index.
 *
 * Why only the nearest:
 * The most common mobile use-case is "am I near a danger zone right now?"
 * The nearest zone answers that with minimal payload. If the app later needs
 * a radius search (e.g. "all zones within 5 km"), that can be a new endpoint.
 *
 * Input  : req.query.lat, req.query.lng  (pre-validated by middleware)
 * Output : { success, message, data: { zone, distanceInMeters } }
 */
const getNearbyDangerZone = async (req, res, next) => {
  try {
    // Validator middleware has already coerced lat/lng to Numbers via .toFloat()
    const { lat, lng } = req.query;

    const zone = await dangerZoneService.getNearestDangerZone(lat, lng);

    // Handle the edge case where the collection is empty
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

// ─── GET /api/crime-score?lat=&lng= ───────────────────────────────────────────

/**
 * Purpose of this handler:
 * Expose the Crime Score and Risk Level for the user's current coordinates.
 * This is the primary signal the mobile app uses to colour-code the user's
 * position (green/yellow/orange/red/crimson) in real time.
 *
 * Response design:
 * crimeScore and riskLevel are promoted to the top level for fast access.
 * distanceInMeters tells the app how relevant the score is (a hotspot 20 km
 * away is far less relevant than one 200 m away).
 * hotspot contains full details for the detail drawer/bottom sheet in the app.
 *
 * Input  : req.query.lat, req.query.lng  (pre-validated by middleware)
 * Output : { success, message, data: { crimeScore, riskLevel, distanceInMeters, hotspot } }
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

module.exports = {
  getAllDangerZones,
  getNearbyDangerZone,
  getCrimeScore,
};
