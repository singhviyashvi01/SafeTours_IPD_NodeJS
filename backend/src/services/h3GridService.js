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
}

module.exports = new H3GridService();
