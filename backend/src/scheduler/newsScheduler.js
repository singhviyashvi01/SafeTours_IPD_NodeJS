const h3 = require('h3-js');
const GridCell = require('../models/GridCell');
const newsService = require('../services/newsService');
const { geocodeLocation } = require('../services/geocodingService');
const { extractLocation } = require('../utils/locationExtractor');
const { severityWeights, defaultNewsWeight } = require('../config/newsSeverity');
const h3GridService = require('../services/h3GridService');
const logger = require('../utils/logger');

/**
 * Determine the news risk score for an article based on keyword match weights.
 */
function getArticleSeverityScore(title, description) {
  const searchableText = `${title || ''} ${description || ''}`.toLowerCase();
  let maxWeight = 0;
  let matched = false;

  for (const [keyword, weight] of Object.entries(severityWeights)) {
    // Exact word boundary matching for configured keywords
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(searchableText)) {
      maxWeight = Math.max(maxWeight, weight);
      matched = true;
    }
  }

  return matched ? maxWeight : defaultNewsWeight;
}

/**
 * Executes the news fetching, processing, geocoding, and score update pipeline.
 */
async function processNewsUpdates() {
  logger.info('[newsScheduler] Executing periodic news intelligence processing...');

  try {
    // 1. Reset all existing newsScore values in GridCell collection to 0 (news is transient)
    logger.info('[newsScheduler] Resetting newsScore for all grid cells...');
    await GridCell.updateMany({}, { $set: { newsScore: 0 } });

    // 2. Fetch normalized articles for Mumbai
    const articles = await newsService.fetchNews('Mumbai');
    if (articles.length === 0) {
      logger.info('[newsScheduler] No news articles fetched. News pipeline completed.');
      return;
    }

    // 3. Process articles: extract location, geocode, H3 map, and compute scores
    const cellScores = {}; // Map of h3Index -> score
    const geocodeCache = {}; // Cache to avoid duplicate geocoding API calls for same neighborhood

    for (const article of articles) {
      const combinedText = `${article.title} ${article.description}`;
      
      // Extract location neighborhood
      const locationName = extractLocation(combinedText);
      if (!locationName) {
        // Skip article if no specific Mumbai location is found
        continue;
      }

      // Check cache or call Geocoding API
      let coords = geocodeCache[locationName];
      if (coords === undefined) {
        coords = await geocodeLocation(locationName);
        geocodeCache[locationName] = coords; // Cache result (even if null)
      }

      if (!coords) {
        // Skip if geocoding failed
        continue;
      }

      // Calculate severity score
      const score = getArticleSeverityScore(article.title, article.description);

      // Convert coordinate to H3 Index (resolution 9)
      let h3Index;
      try {
        h3Index = h3GridService.latLngToH3(coords.latitude, coords.longitude, 9);
      } catch (err) {
        logger.error(`[newsScheduler] H3 conversion failed for coordinates [${coords.latitude}, ${coords.longitude}]: ${err.message}`);
        continue;
      }

      // Accumulate score for this cell (cap at 100)
      cellScores[h3Index] = Math.min(100, (cellScores[h3Index] || 0) + score);
      logger.info(`[newsScheduler] Article mapped to H3 cell ${h3Index} (${locationName}) with score: ${score}`);
    }

    // 4. Apply Modular Neighbor Propagation
    // If a cell has score S, propagate Math.round(S * 0.5) to adjacent cells if their current score is lower
    const finalScores = { ...cellScores };

    for (const [h3Index, score] of Object.entries(cellScores)) {
      if (score <= 0) continue;
      const neighborScore = Math.round(score * 0.5);

      try {
        // Retrieve 1-ring neighbors (filter out the origin cell itself)
        const neighbors = h3.gridDisk(h3Index, 1).filter(cell => cell !== h3Index);

        for (const neighbor of neighbors) {
          if (!finalScores[neighbor] || finalScores[neighbor] < neighborScore) {
            finalScores[neighbor] = neighborScore;
          }
        }
      } catch (err) {
        logger.error(`[newsScheduler] Neighbor lookup failed for H3 cell ${h3Index}: ${err.message}`);
      }
    }

    // 5. Update only existing GridCell documents in MongoDB
    logger.info(`[newsScheduler] Writing scores to MongoDB for ${Object.keys(finalScores).length} cells (including neighbors)...`);
    let updatedCount = 0;

    for (const [h3Index, score] of Object.entries(finalScores)) {
      // Find matching cell by either h3Index or h3CellId
      const cell = await GridCell.findOne({
        $or: [
          { h3Index: h3Index },
          { h3CellId: h3Index }
        ]
      });

      if (cell) {
        cell.newsScore = score;
        cell.updatedAt = new Date();
        await cell.save();
        updatedCount++;
      }
    }

    logger.info(`[newsScheduler] News updates complete. Successfully updated ${updatedCount} GridCells.`);
  } catch (error) {
    logger.error('[newsScheduler] Fatal error occurred in news scheduler:', error);
  }
}

/**
 * Initializes and starts the background news scheduler.
 *
 * @param {number} [intervalMs=900000] - Interval time in milliseconds (default 15 minutes).
 * @returns {Object} The interval timer reference.
 */
function startNewsScheduler(intervalMs = 15 * 60 * 1000) {
  logger.info(`[newsScheduler] Starting news scheduler background job (Interval: ${intervalMs / 1000}s)...`);

  // Run immediately on startup
  processNewsUpdates();

  const intervalId = setInterval(async () => {
    await processNewsUpdates();
  }, intervalMs);

  return intervalId;
}

module.exports = {
  processNewsUpdates,
  startNewsScheduler,
};
