const h3 = require('h3-js');
const GridCell = require('../../models/GridCell');
const logger = require('../../utils/logger');

/**
 * Crime Grid Service — SafeTours IPD
 *
 * Responsibilities:
 * - Receive hotspot polygons
 * - Convert polygon boundaries into H3 cells
 * - Bulk update crimeScore in GridCell documents
 */
class CrimeGridService {
  /**
   * Maps an array of hotspots to H3 cells and updates their crimeScores.
   *
   * @param {Object[]} hotspots - Array of { polygon, crimeScore }
   *   polygon: array of [lat, lng] coordinate pairs representing the hotspot boundary.
   *   crimeScore: numeric risk score for the hotspot.
   * @returns {Promise<number>} - Number of GridCells updated.
   */
  async mapHotspotsToGrid(hotspots) {
    let bulkOps = [];
    const resolution = 9; // H3 resolution matches the base grid

    logger.info(`[CrimeGridService.mapHotspotsToGrid] Processing ${hotspots.length} hotspots...`);

    // Keep track of the highest crimeScore for each H3 index
    // A cell might overlap with multiple hotspots; we usually want the max risk.
    const h3ScoreMap = new Map();

    for (let i = 0; i < hotspots.length; i++) {
      const { polygon, crimeScore } = hotspots[i];
      
      try {
        logger.info(`[CrimeGridService.mapHotspotsToGrid] Crime hotspot received: Hotspot ${i + 1} (Score: ${crimeScore})`);
        
        // h3-js v4 polygonToCells expects polygon coordinates in [lng, lat] format (GeoJSON format)
        // The API input provides [lat, lng], so we must flip them
        const geoJsonPolygon = polygon.map(coord => [coord[1], coord[0]]);
        
        let h3Indexes = h3.polygonToCells(geoJsonPolygon, resolution, true); // true = exact match if available
        
        // Robust Fallback: If a hotspot polygon is very small (less than H3 Resolution 9 edge length),
        // polygonToCells may return 0 cells because no cell centroids fall inside it.
        // In this case, we fallback to mapping the hotspot to the single H3 cell that contains its centroid.
        if (h3Indexes.length === 0 && polygon.length > 0) {
          let latSum = 0;
          let lngSum = 0;
          for (const coord of polygon) {
            latSum += coord[0];
            lngSum += coord[1];
          }
          const avgLat = latSum / polygon.length;
          const avgLng = lngSum / polygon.length;
          const fallbackIndex = h3.latLngToCell(avgLat, avgLng, resolution);
          h3Indexes = [fallbackIndex];
          logger.info(`[CrimeGridService.mapHotspotsToGrid] Small hotspot fallback: Map to single H3 cell ${fallbackIndex} at centroid (${avgLat.toFixed(4)}, ${avgLng.toFixed(4)})`);
        } else {
          logger.info(`[CrimeGridService.mapHotspotsToGrid] Converted: ${h3Indexes.length} H3 cells for this hotspot.`);
        }

        for (const index of h3Indexes) {
          // If a cell is covered by multiple hotspots, take the maximum crime score (highest wins)
          if (!h3ScoreMap.has(index) || h3ScoreMap.get(index) < crimeScore) {
            h3ScoreMap.set(index, crimeScore);
          }
        }
      } catch (err) {
        logger.warn(`[CrimeGridService.mapHotspotsToGrid] Failed to process polygon at index ${i}: ${err.message}`);
        // Continue processing other hotspots
      }
    }

    // Build bulkWrite operations for MongoDB
    for (const [h3Index, score] of h3ScoreMap.entries()) {
      bulkOps.push({
        updateOne: {
          filter: { h3Index },
          update: {
            $set: {
              crimeScore: score,
              updatedAt: new Date(),
            },
          },
        },
      });
    }

    if (bulkOps.length === 0) {
      logger.info('[CrimeGridService.mapHotspotsToGrid] No valid H3 cells generated. Nothing to update.');
      return 0;
    }

    logger.info(`[CrimeGridService.mapHotspotsToGrid] Executing bulkWrite for ${bulkOps.length} cells...`);
    
    // Execute bulk update
    // Note: We use GridCell model directly
    try {
      const result = await GridCell.bulkWrite(bulkOps, { ordered: false });
      logger.info(`[CrimeGridService.mapHotspotsToGrid] Updated: ${result.modifiedCount} GridCell documents (Matched: ${result.matchedCount}).`);
      // Return modified count. If matchedCount > modifiedCount, some cells already had the exact same score.
      return result.matchedCount; 
    } catch (dbError) {
      logger.error('[CrimeGridService.mapHotspotsToGrid] BulkWrite failed.', dbError);
      throw new Error('Database bulk write failed during hotspot mapping.');
    }
  }

  /**
   * Retrieves the current crime score for a specific H3 cell.
   * This is a reusable function intended for the future Risk Engine.
   * 
   * @param {string} h3Index - The H3 index to look up
   * @returns {Promise<number>} - The crimeScore (defaults to 0 if not found)
   */
  async getCrimeScoreByH3(h3Index) {
    try {
      const cell = await GridCell.findOne({ h3Index }).select('crimeScore').lean();
      return cell ? cell.crimeScore : 0;
    } catch (error) {
      logger.error(`[CrimeGridService.getCrimeScoreByH3] Failed to retrieve score for cell ${h3Index}.`, error);
      throw new Error('Failed to retrieve crime score.');
    }
  }
}

module.exports = new CrimeGridService();
