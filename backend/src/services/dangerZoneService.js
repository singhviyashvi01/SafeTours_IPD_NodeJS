const DangerZone = require('../models/DangerZone');
const logger = require('../utils/logger');

/**
 * DangerZoneService — SafeTours IPD
 *
 * Purpose of this class:
 * Encapsulate all MongoDB query logic for the DangerZone collection.
 * Controllers stay thin by delegating every database interaction here.
 *
 * Why a class singleton:
 * Matches the pattern used in LocationService — exported as `new DangerZoneService()`
 * so all controllers share one instance with no risk of parallel state.
 */
class DangerZoneService {
  /**
   * Purpose of this method:
   * Return every document in the DangerZone collection, sorted from most
   * dangerous to least so the consumer can render a ranked list immediately.
   *
   * Why no pagination yet:
   * The dataset is static (289 hotspots) and small enough to send whole.
   * A cursor-based pagination layer can be added when the collection grows.
   *
   * @returns {Promise<Object[]>} Array of all DangerZone documents.
   * @throws {Error} If the database query fails.
   */
  async getAllDangerZones() {
    try {
      const zones = await DangerZone.find({})
        // Sort: highest crime score first — most useful default for a safety app
        .sort({ crimeScore: -1 })
        // Exclude internal Mongoose versioning key from the response
        .select('-__v')
        .lean(); // .lean() returns plain JS objects — faster than Mongoose documents for read-only payloads

      logger.info(`[DangerZoneService.getAllDangerZones] Fetched ${zones.length} danger zones.`);
      return zones;
    } catch (error) {
      logger.error('[DangerZoneService.getAllDangerZones] Database query failed.', error);
      throw new Error('Failed to retrieve danger zones from the database.');
    }
  }

  /**
   * Purpose of this method:
   * Find the single nearest DangerZone to a given coordinate pair using
   * MongoDB's $geoNear aggregation stage, which leverages the 2dsphere index
   * on `location` for an O(log n) spatial lookup.
   *
   * Why $geoNear instead of $near:
   * $geoNear is an aggregation stage so it naturally returns the calculated
   * distance in the result document — no separate computation needed.
   *
   * @param {number} latitude  - WGS84 latitude  (-90 to 90).
   * @param {number} longitude - WGS84 longitude (-180 to 180).
   * @returns {Promise<Object|null>} The nearest DangerZone with a `distanceInMeters` field,
   *                                 or null if the collection is empty.
   * @throws {Error} If the database query fails.
   */
  async getNearestDangerZone(latitude, longitude) {
    try {
      // $geoNear MUST be the first stage in an aggregation pipeline.
      // `near` uses [longitude, latitude] — GeoJSON coordinate order.
      //
      // WHY Number() here:
      // req.query always delivers values as strings. express-validator's
      // .toFloat() coerces only within its own validation result object and
      // does NOT mutate req.query. MongoDB's $geoNear rejects string
      // coordinates with "invalid argument in geo near query: type".
      // Coercing at this boundary makes the service safe regardless of
      // whether the caller originates from an HTTP request or an internal call.
      const lng = Number(longitude);
      const lat = Number(latitude);

      const results = await DangerZone.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [lng, lat], // GeoJSON: [longitude, latitude] — both guaranteed Numbers
            },
            distanceField: 'distanceInMeters', // MongoDB injects this field into each result document
            spherical: true,                   // Use spherical (Haversine) geometry — required for 2dsphere
            key: 'location',                   // Explicitly name the index field — required when a collection
                                               // has more than one geospatial index to avoid ambiguity
          },
        },
        { $limit: 1 },        // We only need the single closest document
        { $project: { __v: 0 } }, // Exclude the versioning key
      ]);

      if (!results.length) {
        logger.warn('[DangerZoneService.getNearestDangerZone] No danger zones found in collection.');
        return null;
      }

      const zone = results[0];
      logger.info(
        `[DangerZoneService.getNearestDangerZone] Nearest zone is hotspot #${zone.hotspotId} at ${zone.distanceInMeters.toFixed(0)}m.`
      );
      return zone;
    } catch (error) {
      logger.error('[DangerZoneService.getNearestDangerZone] Geospatial query failed.', error);
      throw new Error('Failed to execute geospatial query on the database.');
    }
  }

  /**
   * Purpose of this method:
   * Return the Crime Score and Risk Level for a given coordinate by locating
   * the nearest hotspot. This is the primary signal consumed by the mobile app
   * to colour-code the user's current location on the map.
   *
   * Why reuse getNearestDangerZone:
   * Both /nearby and /crime-score need the closest hotspot. Keeping the query
   * logic in one place prevents divergence and makes it easier to add caching later.
   *
   * @param {number} latitude  - WGS84 latitude.
   * @param {number} longitude - WGS84 longitude.
   * @returns {Promise<Object|null>} Object with crimeScore, riskLevel, distanceInMeters,
   *                                 and full hotspot details; or null if collection is empty.
   * @throws {Error} If the database query fails.
   */
  async getCrimeScoreForLocation(latitude, longitude) {
    // Reuse the same geospatial query — same result, different response shape
    const nearestZone = await this.getNearestDangerZone(latitude, longitude);

    if (!nearestZone) {
      return null;
    }

    // Shape the response to surface the most critical fields at the top level
    // while grouping the full spatial data under `hotspot` for clarity.
    return {
      crimeScore:        nearestZone.crimeScore,
      riskLevel:         nearestZone.riskLevel,
      distanceInMeters:  Math.round(nearestZone.distanceInMeters), // Round to whole meters
      hotspot: {
        hotspotId:              nearestZone.hotspotId,
        location:               nearestZone.location,
        crimeCount:             nearestZone.crimeCount,
        averageCrimeSeverity:   nearestZone.averageCrimeSeverity,
        maximumCrimeSeverity:   nearestZone.maximumCrimeSeverity,
        crimeTypes:             nearestZone.crimeTypes,
      },
    };
  }
}

// Export as a singleton — matches LocationService pattern
module.exports = new DangerZoneService();
