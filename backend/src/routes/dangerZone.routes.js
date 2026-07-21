const express = require('express');

const router = express.Router();

const {
  getAllDangerZones,
  getNearbyDangerZone,
  getCrimeScore,
  getDangerZoneByH3Index,
} = require('../controllers/dangerZone.controller');

const {
  validateCoordinateRules,
  validateNearbyRules,
  validateBoundingBoxRules,
  validateH3IndexRules,
  validateCoordinateRequest,
} = require('../validators/dangerZoneValidator');

/**
 * DangerZone Routes — SafeTours IPD
 *
 * Purpose of this file:
 * Register all Crime & Spatial Intelligence endpoints and attach the appropriate
 * validation middleware chain to each one. Route definitions stay thin —
 * no logic lives here.
 *
 * Mounted at: /api/danger-zones  (see app.js)
 *
 * Public routes (no JWT required):
 * Spatial danger data is read-only and public to allow map rendering before login.
 *
 * Endpoint overview
 * ─────────────────
 *   GET /api/danger-zones             → all hotspots OR bounding box search (?minLat=&maxLat=&minLng=&maxLng=)
 *   GET /api/danger-zones/nearby      → nearby danger zones to ?lat=&lng=&radius=
 *   GET /api/danger-zones/crime-score → crime score summary for ?lat=&lng=
 *   GET /api/danger-zones/:h3Index    → direct lookup of single H3 cell details
 */

// ─── GET /api/danger-zones ────────────────────────────────────────────────────
/**
 * Returns DangerZone documents inside bounding box if query params supplied,
 * or all DangerZone documents if query params are omitted.
 */
router.get(
  '/',
  validateBoundingBoxRules,
  validateCoordinateRequest,
  getAllDangerZones
);

// ─── GET /api/danger-zones/nearby?lat=&lng=&radius= ───────────────────────────
/**
 * Returns nearby DangerZone documents within radius (meters) using H3 expansion.
 */
router.get(
  '/nearby',
  validateNearbyRules,
  validateCoordinateRequest,
  getNearbyDangerZone
);

// ─── GET /api/danger-zones/crime-score?lat=&lng= ──────────────────────────────
/**
 * Returns crimeScore, riskLevel, distance, and hotspot details for coordinates.
 */
router.get(
  '/crime-score',
  validateCoordinateRules,
  validateCoordinateRequest,
  getCrimeScore
);

// ─── GET /api/danger-zones/:h3Index ───────────────────────────────────────────
/**
 * Returns complete stored details of one H3 cell by its 15-character hex ID.
 * Declared AFTER /nearby and /crime-score so Express does not accidentally match
 * literal endpoints like "nearby" as an `:h3Index` parameter.
 */
router.get(
  '/:h3Index',
  validateH3IndexRules,
  validateCoordinateRequest,
  getDangerZoneByH3Index
);

module.exports = router;
