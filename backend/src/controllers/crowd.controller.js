const GridCell = require('../models/GridCell');
const cellRisk = require('../services/risk/cellRisk.service');
const { evaluate } = require('../services/risk/riskEngine');
const feedStatus = require('../services/risk/feedStatus.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/apiError');

/**
 * GET /api/crowd/score?lat&lng
 * Crowd component of the cell containing the point, read from the database. There is no external API
 * call here: places are cached by scheduler/crowdScheduler.js and the score is refreshed hourly.
 */
const getCrowdScore = asyncHandler(async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new ApiError(400, 'lat must be a number between -90 and 90.');
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new ApiError(400, 'lng must be a number between -180 and 180.');

  const h3Index = cellRisk.toCell(lat, lng);
  const cell = await GridCell.findOne({ h3Index }).select('components.crowd').lean();
  const feeds = await feedStatus.getAll();
  const result = evaluate({ components: { crowd: cell?.components?.crowd }, feeds });
  const b = result.breakdown.crowd;
  const meta = cell?.components?.crowd?.meta || {};

  res.status(200).json({
    success: true,
    message: b.available ? 'Crowd score retrieved successfully.' : 'No crowd data available for this location yet.',
    data: {
      h3Index,
      crowdScore: b.score, // null when unavailable: never a fake 0
      status: b.status, // fresh | stale | expired | missing
      ageMinutes: b.ageMinutes,
      nearbyPlaceCount: meta.poiCount ?? 0,
      topPlaces: meta.topPlaces || [],
      lowConfidence: Boolean(meta.lowConfidence),
    },
  });
});

module.exports = { getCrowdScore };
