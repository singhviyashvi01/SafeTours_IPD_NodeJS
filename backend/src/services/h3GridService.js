const GridCell = require('../models/GridCell');
const logger = require('../utils/logger');

/**
 * H3 Grid Service — SafeTours IPD
 *
 * Encapsulates all interactions with the GridCell collection.
 */
class H3GridService {
  /**
   * Drops the existing grid cells (useful for complete regeneration)
   */
  async clearGrid() {
    try {
      logger.info('[H3GridService.clearGrid] Emptying GridCell collection...');
      await GridCell.deleteMany({});
      logger.info('[H3GridService.clearGrid] Collection cleared.');
    } catch (error) {
      logger.error('[H3GridService.clearGrid] Failed to clear grid.', error);
      throw error;
    }
  }

  /**
   * Bulk inserts a new array of GridCells
   *
   * @param {Object[]} cells - Array of GridCell document objects
   */
  async insertCellsBulk(cells) {
    try {
      logger.info(`[H3GridService.insertCellsBulk] Bulk inserting ${cells.length} cells...`);
      const result = await GridCell.bulkWrite(
        cells.map((cell) => ({
          updateOne: {
            filter: { h3Index: cell.h3Index },
            update: { $set: cell },
            upsert: true,
          },
        })),
        { ordered: false }
      );
      logger.info(`[H3GridService.insertCellsBulk] Bulk write complete. Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`);
      return result;
    } catch (error) {
      logger.error('[H3GridService.insertCellsBulk] Failed to bulk insert cells.', error);
      throw error;
    }
  }

  /**
   * Get total number of cells in the collection
   */
  async countCells() {
    return await GridCell.countDocuments();
  }

  // ─── Phase 1 Engine Helpers ──────────────────────────────────────────────────

  /**
   * What the code is doing:
   * Converts WGS84 latitude and longitude coordinates into a single H3 index cell string.
   * Why it is required:
   * Required by Phase 3 (Crowd) and Phase 4 (Environmental) to map geographic coordinates to H3 cells.
   * Which existing Phase 1 or Phase 2 implementation is being reused:
   * Reuses the Phase 1 H3 Engine and h3-js v4 library with resolution 9.
   *
   * @param {number|string} lat - WGS84 latitude (-90 to 90)
   * @param {number|string} lng - WGS84 longitude (-180 to 180)
   * @param {number} resolution - H3 grid resolution (default: 9)
   * @returns {string} H3 index string
   */
  latLngToH3(lat, lng, resolution = 9) {
    const h3 = require('h3-js');
    const latitude = Number(lat);
    const longitude = Number(lng);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error('Latitude and longitude must be valid numbers for H3 conversion.');
    }

    return h3.latLngToCell(latitude, longitude, resolution);
  }

  /**
   * What the code is doing:
   * Retrieves a list of H3 cell indexes surrounding a coordinate within an affected radius.
   * Why it is required:
   * Needed by Phase 4 (Environmental) when weather or environmental events affect multiple nearby locations.
   * Which existing Phase 1 or Phase 2 implementation is being reused:
   * Reuses Phase 1 H3 grid conversion and h3-js v4 gridDisk utility.
   *
   * @param {number|string} lat - WGS84 latitude
   * @param {number|string} lng - WGS84 longitude
   * @param {number} radiusInKm - Affected radius in kilometers (0 for single cell)
   * @param {number} resolution - H3 grid resolution (default: 9)
   * @returns {string[]} Array of affected H3 cell index strings
   */
  getAffectedH3Cells(lat, lng, radiusInKm = 0, resolution = 9) {
    const h3 = require('h3-js');
    const originCell = this.latLngToH3(lat, lng, resolution);
    const radius = Number(radiusInKm);

    if (!radius || radius <= 0) {
      return [originCell];
    }

    // Resolution 9 average edge length is ~0.1 km (100m).
    // Calculate k-ring distance (k) based on radius in kilometers.
    const k = Math.max(1, Math.min(10, Math.round(radius / 0.1)));
    return h3.gridDisk(originCell, k);
  }
}

module.exports = new H3GridService();
