const express = require('express');

const router = express.Router();

const {
  getAllDangerZones,
  getNearbyDangerZone,
  getCrimeScore,
} = require('../controllers/dangerZone.controller');

const {
  validateCoordinateRules,
  validateCoordinateRequest,
} = require('../validators/dangerZoneValidator');

/**
 * DangerZone Routes — SafeTours IPD
 *
 * Purpose of this file:
 * Register all Crime Intelligence endpoints and attach the appropriate
 * validation middleware chain to each one. Route definitions stay thin —
 * no logic lives here.
 *
 * Mounted at: /api/danger-zones  (see app.js)
 *
 * Public routes (no JWT required):
 * Crime hotspot data is static, read-only, and not user-sensitive.
 * Keeping these endpoints public lets the app display the danger map before
 * the user authenticates (e.g. splash screen, onboarding flow).
 *
 * Endpoint overview
 * ─────────────────
 *   GET /api/danger-zones             → all hotspots
 *   GET /api/danger-zones/nearby      → nearest hotspot to ?lat=&lng=
 *   GET /api/danger-zones/crime-score → crime score summary for ?lat=&lng=
 */

// ─── GET /api/danger-zones ────────────────────────────────────────────────────
/**
 * Returns all DangerZone documents sorted by crimeScore descending.
 * No coordinate input required.
 */
router.get('/', getAllDangerZones);

// ─── GET /api/danger-zones/nearby?lat=&lng= ───────────────────────────────────
/**
 * Returns the single nearest DangerZone to the supplied coordinates.
 * Middleware chain:
 *   1. validateCoordinateRules  — express-validator rules declared on lat/lng query params
 *   2. validateCoordinateRequest — collects rule errors and short-circuits with 400 if any
 *   3. getNearbyDangerZone      — controller calls the geospatial service
 */
router.get(
  '/nearby',
  validateCoordinateRules,
  validateCoordinateRequest,
  getNearbyDangerZone
);

// ─── GET /api/danger-zones/crime-score?lat=&lng= ──────────────────────────────
/**
 * Returns crimeScore, riskLevel, distance, and hotspot details for coordinates.
 * Same validation chain as /nearby — both endpoints take identical query params.
 *
 * Note: /crime-score is declared AFTER /nearby so Express does not
 * accidentally match it as the `:id` segment of a future parameterised route.
 */
router.get(
  '/crime-score',
  validateCoordinateRules,
  validateCoordinateRequest,
  getCrimeScore
);

module.exports = router;
