const nearbyService = require('../services/nearby/nearbyService');
const cfg = require('../config/nearby.config');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/nearby?lat&lng[&radius=3000][&types=hospital,police,pharmacy,fire_station][&limit=50]
const getNearby = asyncHandler(async (req, res) => {
  const { lat, lng, radius, limit } = req.query;
  const types = req.query.types ? String(req.query.types).split(',').map((t) => t.trim()).filter(Boolean) : undefined;

  const result = await nearbyService.getNearby({ lat, lng, radius: radius || cfg.radius.default, types, limit });

  // An unavailable lookup is still a 200 with an empty list and status "unavailable": the client shows
  // its own cache or "No data for this area". Nothing is invented.
  res.status(200).json({ success: true, ...result });
});

module.exports = { getNearby };
