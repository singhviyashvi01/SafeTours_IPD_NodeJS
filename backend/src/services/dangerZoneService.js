const DangerZone = require('../models/DangerZone');
const riskEngineService = require('./riskEngine.service');
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
   * What this code is doing:
   * Queries MongoDB DangerZone documents within a 2D bounding box using $geoWithin $box.
   * Why it is needed:
   * Enables the frontend map view to render only DangerZones inside the active map screen viewport.
   * Which existing module is being reused:
   * Uses MongoDB 2dsphere / GeoJSON index on DangerZone.location.
   * How the frontend consumes this API:
   * Called by GET /api/danger-zones?minLat=18.9&maxLat=19.1&minLng=72.8&maxLng=72.9 when zooming/panning the map.
   */
  async getDangerZonesInBoundingBox(minLat, maxLat, minLng, maxLng) {
    try {
      const zones = await DangerZone.find({
        location: {
          $geoWithin: {
            $box: [
              [Number(minLng), Number(minLat)], // Bottom-left [longitude, latitude]
              [Number(maxLng), Number(maxLat)], // Top-right [longitude, latitude]
            ],
          },
        },
      })
        .sort({ crimeScore: -1 })
        .select('-__v')
        .lean();

      logger.info(`[DangerZoneService.getDangerZonesInBoundingBox] Fetched ${zones.length} zones in box [${minLat}, ${minLng}] -> [${maxLat}, ${maxLng}].`);
      return zones;
    } catch (error) {
      logger.error('[DangerZoneService.getDangerZonesInBoundingBox] Bounding box query failed.', error);
      throw new Error('Failed to retrieve danger zones within bounding box.');
    }
  }

  /**
   * What this code is doing:
   * Retrieves nearby DangerZones within a radius (meters) using H3 cell expansion and $geoNear.
   * Why it is needed:
   * Enables nearby spatial search for safety alerts around a user's location.
   * Which existing module is being reused:
   * Reuses h3GridService.getAffectedH3Cells for H3 indexing and 2dsphere index for distance calculation.
   * How the frontend consumes this API:
   * Called by GET /api/danger-zones/nearby?lat=18.9220&lng=72.8347&radius=2000.
   */
  async getDangerZonesNearby(latitude, longitude, radiusInMeters = 1000) {
    try {
      const h3GridService = require('./h3GridService');
      const radiusKm = Math.max(0.1, Number(radiusInMeters) / 1000);

      // Get nearby H3 cells within radius using existing H3 utility
      const nearbyH3Cells = h3GridService.getAffectedH3Cells(latitude, longitude, radiusKm, 9);

      // Perform fast indexed query on DangerZone documents by matching h3Index
      let zones = await DangerZone.find({
        h3Index: { $in: nearbyH3Cells },
      })
        .select('-__v')
        .lean();

      // If no cell-matched zones, fallback to $geoNear with maxDistance
      if (zones.length === 0) {
        zones = await DangerZone.aggregate([
          {
            $geoNear: {
              near: {
                type: 'Point',
                coordinates: [Number(longitude), Number(latitude)],
              },
              distanceField: 'distanceInMeters',
              maxDistance: Number(radiusInMeters),
              spherical: true,
              key: 'location',
            },
          },
          { $project: { __v: 0 } },
        ]);
      }

      logger.info(`[DangerZoneService.getDangerZonesNearby] Found ${zones.length} nearby zones within ${radiusInMeters}m.`);
      return zones;
    } catch (error) {
      logger.error('[DangerZoneService.getDangerZonesNearby] Nearby query failed.', error);
      throw new Error('Failed to retrieve nearby danger zones.');
    }
  }

  /**
   * What this code is doing:
   * Retrieves complete stored details of one H3 cell by its h3Index string without recalculating anything.
   * Why it is needed:
   * Enables map detail popups / drawers when a user taps an H3 hexagon cell on the map.
   * Which existing module is being reused:
   * Reuses DangerZone model and GridCell model fallback.
   * How the frontend consumes this API:
   * Called by GET /api/danger-zones/:h3Index (e.g. GET /api/danger-zones/8928308280fffff).
   */
  async getDangerZoneByH3Index(h3Index) {
    try {
      const GridCell = require('../models/GridCell');

      // 1. Direct indexed query on DangerZone collection
      let zone = await DangerZone.findOne({ h3Index }).select('-__v').lean();

      // 2. If not in DangerZone hotspot collection, check GridCell collection
      if (!zone) {
        const gridCell = await GridCell.findOne({
          $or: [{ h3Index }, { h3CellId: h3Index }],
        }).select('-__v').lean();

        if (gridCell) {
          // Normalize GridCell format into DangerZone response shape
          zone = {
            h3Index: gridCell.h3Index || gridCell.h3CellId,
            crimeScore: gridCell.crimeScore || 0,
            crowdScore: gridCell.crowdScore || 0,
            environmentalScore: gridCell.weatherScore || 0,
            weatherScore: gridCell.weatherScore || 0,
            newsScore: gridCell.newsScore || 0,
            communityScore: gridCell.communityScore || 0,
            totalRiskScore: gridCell.totalRiskScore || gridCell.totalRisk || 0,
            riskLevel: gridCell.level || 'SAFE',
            lastWeatherUpdate: gridCell.updatedAt,
            lastNewsUpdate: gridCell.updatedAt,
            createdAt: gridCell.createdAt,
            updatedAt: gridCell.updatedAt,
          };
        }
      }

      if (!zone) {
        logger.warn(`[DangerZoneService.getDangerZoneByH3Index] H3 cell '${h3Index}' not found.`);
        return null;
      }

      logger.info(`[DangerZoneService.getDangerZoneByH3Index] Successfully fetched H3 cell '${h3Index}'.`);
      return zone;
    } catch (error) {
      logger.error(`[DangerZoneService.getDangerZoneByH3Index] Lookup failed for '${h3Index}'.`, error);
      throw new Error(`Failed to retrieve DangerZone for H3 index '${h3Index}'.`);
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

  // ─── Phase 3 & Phase 4 Update Methods ─────────────────────────────────────────

  /**
   * What the code is doing:
   * Updates ONLY the `crowdScore` and `h3Index` fields of the nearest DangerZone document.
   * Why it is required:
   * Enables Phase 3 (Crowd Module) to persist calculated crowd scores into MongoDB safely without overwriting crime or weather data.
   * Which existing Phase 1 or Phase 2 implementation is being reused:
   * Reuses getNearestDangerZone from Phase 2 and DangerZone Mongoose model with atomic MongoDB $set.
   *
   * @param {number} latitude - WGS84 latitude
   * @param {number} longitude - WGS84 longitude
   * @param {number} crowdScore - Calculated crowd score (0-100)
   * @param {string} h3Index - H3 index string for the coordinate
   * @returns {Promise<Object|null>} Updated DangerZone document or null if no zone found.
   */
  async updateCrowdScore(latitude, longitude, crowdScore, h3Index) {
    try {
      const nearestZone = await this.getNearestDangerZone(latitude, longitude);
      if (!nearestZone) {
        logger.warn('[DangerZoneService.updateCrowdScore] No DangerZone found to update crowd score.');
        return null;
      }

      // Calculate composite risk via centralized Risk Engine using all existing sub-scores
      const riskResult = riskEngineService.calculateRisk({
        crimeScore: nearestZone.crimeScore || 0,
        weatherScore: nearestZone.weatherScore || 0,
        newsScore: nearestZone.newsScore || 0,
        crowdScore: Number(crowdScore),
        communityScore: nearestZone.communityScore || 0,
        ewsScore: nearestZone.ewsScore || 0,
      });

      // Atomic $set: updates crowdScore, h3Index, totalRiskScore, riskLevel, and updatedAt.
      // Never overwrites crimeScore, weatherScore, environmentalScore, or infraScore.
      const updatedZone = await DangerZone.findByIdAndUpdate(
        nearestZone._id,
        {
          $set: {
            crowdScore: Number(crowdScore),
            totalRiskScore: riskResult.totalRiskScore,
            riskLevel: riskResult.level,
            ...(h3Index && { h3Index }),
            updatedAt: new Date(),
          },
        },
        { new: true, runValidators: true }
      ).lean();

      logger.info(
        `[DangerZoneService.updateCrowdScore] Updated DangerZone #${nearestZone.hotspotId} crowdScore to ${crowdScore}, totalRiskScore=${riskResult.totalRiskScore}, level=${riskResult.level}.`
      );
      return updatedZone;
    } catch (error) {
      logger.error('[DangerZoneService.updateCrowdScore] Failed to update crowd score in MongoDB.', error);
      throw new Error('Failed to update crowd score in database.');
    }
  }

  /**
   * What the code is doing:
   * Updates ONLY `weatherScore`, `environmentalScore`, `lastWeatherUpdate`, and `h3Index` in DangerZone document(s).
   * Why it is required:
   * Enables Phase 4 (Environmental H3 Module) to persist weather and environmental risk scores into MongoDB safely.
   * Which existing Phase 1 or Phase 2 implementation is being reused:
   * Reuses getNearestDangerZone / 2dsphere index from Phase 2 and DangerZone Mongoose model with atomic $set.
   *
   * @param {number} latitude - WGS84 latitude
   * @param {number} longitude - WGS84 longitude
   * @param {number} weatherScore - Calculated weather score (0-100)
   * @param {number} environmentalScore - Calculated environmental score (0-100)
   * @param {string} h3Index - H3 index string for coordinate
   * @param {string[]} [affectedH3Cells] - Optional array of affected H3 cells for multi-location weather impact
   * @returns {Promise<Object[]>} Array of updated DangerZone documents.
   */
  async updateEnvironmentalScore(latitude, longitude, weatherScore, environmentalScore, h3Index, affectedH3Cells = []) {
    try {
      let filter = {};

      if (Array.isArray(affectedH3Cells) && affectedH3Cells.length > 0) {
        // Match DangerZones with h3Index in affectedH3Cells
        filter = { h3Index: { $in: affectedH3Cells } };
      }

      // If no cell-matched zones found, fallback to updating nearest zone by coordinates
      const existingMatchingZones = filter.h3Index ? await DangerZone.find(filter).lean() : [];

      if (existingMatchingZones.length > 0) {
        // Build per-zone risk calculations and updateMany using a shared environmental update
        // For multi-zone updateMany: use a representative zone's scores as baseline
        const representativeZone = existingMatchingZones[0];
        const riskResult = riskEngineService.calculateRisk({
          crimeScore: representativeZone.crimeScore || 0,
          weatherScore: Number(weatherScore),
          newsScore: representativeZone.newsScore || 0,
          crowdScore: representativeZone.crowdScore || 0,
          communityScore: representativeZone.communityScore || 0,
          ewsScore: representativeZone.ewsScore || 0,
        });

        await DangerZone.updateMany(filter, {
          $set: {
            weatherScore: Number(weatherScore),
            environmentalScore: Number(environmentalScore),
            totalRiskScore: riskResult.totalRiskScore,
            riskLevel: riskResult.level,
            lastWeatherUpdate: new Date(),
            lastNewsUpdate: new Date(),
            updatedAt: new Date(),
          },
        });
        const updatedZones = await DangerZone.find(filter).lean();
        logger.info(
          `[DangerZoneService.updateEnvironmentalScore] Updated ${updatedZones.length} affected DangerZone documents. TotalRiskScore=${riskResult.totalRiskScore}, Level=${riskResult.level}`
        );
        return updatedZones;
      }

      // Default: Update nearest single zone
      const nearestZone = await this.getNearestDangerZone(latitude, longitude);
      if (!nearestZone) {
        logger.warn('[DangerZoneService.updateEnvironmentalScore] No DangerZone found to update environmental score.');
        return [];
      }

      const riskResult = riskEngineService.calculateRisk({
        crimeScore: nearestZone.crimeScore || 0,
        weatherScore: Number(weatherScore),
        newsScore: nearestZone.newsScore || 0,
        crowdScore: nearestZone.crowdScore || 0,
        communityScore: nearestZone.communityScore || 0,
        ewsScore: nearestZone.ewsScore || 0,
      });

      const updatedZone = await DangerZone.findByIdAndUpdate(
        nearestZone._id,
        {
          $set: {
            weatherScore: Number(weatherScore),
            environmentalScore: Number(environmentalScore),
            totalRiskScore: riskResult.totalRiskScore,
            riskLevel: riskResult.level,
            lastWeatherUpdate: new Date(),
            lastNewsUpdate: new Date(),
            ...(h3Index && { h3Index }),
            updatedAt: new Date(),
          },
        },
        { new: true, runValidators: true }
      ).lean();

      logger.info(
        `[DangerZoneService.updateEnvironmentalScore] Updated DangerZone #${nearestZone.hotspotId} weatherScore=${weatherScore}, totalRiskScore=${riskResult.totalRiskScore}, level=${riskResult.level}.`
      );
      return [updatedZone];
    } catch (error) {
      logger.error('[DangerZoneService.updateEnvironmentalScore] Failed to update environmental score in MongoDB.', error);
      throw new Error('Failed to update environmental score in database.');
    }
  }

  /**
   * What this code is doing:
   * Resolves coordinates to an H3 index and retrieves the corresponding DangerZone document.
   * Why it is needed:
   * Enables Phase 5 — Location Risk Service to return safety metrics for a user's current location.
   * Which existing module is being reused:
   * Reuses h3GridService.latLngToH3 and the DangerZone mongoose model.
   *
   * @param {number|string} latitude - WGS84 latitude
   * @param {number|string} longitude - WGS84 longitude
   * @returns {Promise<Object|null>} DangerZone document or null if not found.
   */
  async getLocationRisk(latitude, longitude) {
    try {
      const h3GridService = require('./h3GridService');
      
      // Step 2: Convert latitude and longitude into H3 index (resolution 9)
      const h3Index = h3GridService.latLngToH3(latitude, longitude, 9);
      
      logger.info(`[DangerZoneService.getLocationRisk] Coordinate [${latitude}, ${longitude}] mapped to H3 index '${h3Index}'.`);

      // Step 3: Find corresponding DangerZone document in MongoDB
      const zone = await DangerZone.findOne({ h3Index })
        .select('-__v')
        .lean();

      if (!zone) {
        logger.warn(`[DangerZoneService.getLocationRisk] No DangerZone found for H3 index '${h3Index}'.`);
        return null;
      }

      logger.info(`[DangerZoneService.getLocationRisk] Successfully retrieved DangerZone for H3 index '${h3Index}'.`);
      return zone;
    } catch (error) {
      logger.error(`[DangerZoneService.getLocationRisk] Lookup failed for coordinates [${latitude}, ${longitude}].`, error);
      throw new Error('Failed to retrieve location risk details from the database.');
    }
  }
}

// Export as a singleton — matches LocationService pattern
module.exports = new DangerZoneService();
