const express = require('express');
const router = express.Router();

const { mapHotspots } = require('./crimeController');
const { validateMapHotspotsRules, validateCrimeRequest } = require('../../validators/crimeValidator');

/**
 * Crime Routes — SafeTours IPD
 *
 * Endpoint overview
 * ─────────────────
 *   POST /api/crime/map-hotspots   → map hotspot polygons to H3 grid and update crimeScore
 */

router.post(
  '/map-hotspots',
  validateMapHotspotsRules,
  validateCrimeRequest,
  mapHotspots
);

module.exports = router;
