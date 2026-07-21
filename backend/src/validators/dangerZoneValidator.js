const { query, param, validationResult } = require('express-validator');
const h3 = require('h3-js');

/**
 * DangerZone Validator — SafeTours IPD
 *
 * Purpose of this file:
 * Define and export reusable validation rule chains and a result-handler
 * middleware for all DangerZone endpoints that accept query and URL params.
 *
 * Why express-validator instead of manual checks:
 * Matches the pattern used in locationValidator.js and sosValidator.js.
 * Keeps validation declarative and the controller completely free of
 * repetitive guard clauses.
 */

// ─── Reusable coordinate rules (query params) ─────────────────────────────────

/**
 * What this code is doing:
 * Validates `lat` and `lng` as required, finite, in-range floating-point query parameters.
 * Why it is needed:
 * Prevents invalid or out-of-range coordinates from causing spatial query errors in MongoDB.
 * Which existing module is being reused:
 * Uses express-validator query() middleware.
 * How the frontend consumes this API:
 * Frontend passes `?lat=18.9220&lng=72.8347` for point-based spatial queries.
 */
const validateCoordinateRules = [
  query('lat')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Latitude (lat) is required.')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90.')
    .toFloat(),

  query('lng')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Longitude (lng) is required.')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180.')
    .toFloat(),
];

/**
 * What this code is doing:
 * Validates optional `radius` query parameter alongside `lat` and `lng`.
 * Why it is needed:
 * Allows frontend to request nearby danger zones within a custom search radius.
 * Which existing module is being reused:
 * Extends validateCoordinateRules with express-validator.
 * How the frontend consumes this API:
 * Frontend passes `?lat=18.9220&lng=72.8347&radius=2000` (radius in meters).
 */
const validateNearbyRules = [
  ...validateCoordinateRules,
  query('radius')
    .optional()
    .isFloat({ min: 1, max: 100000 })
    .withMessage('Radius must be a positive number up to 100000 meters.')
    .toFloat(),
];

/**
 * What this code is doing:
 * Validates optional bounding box query parameters (`minLat`, `maxLat`, `minLng`, `maxLng`).
 * Why it is needed:
 * Enables the frontend map view to fetch only DangerZones visible inside the current map viewport.
 * Which existing module is being reused:
 * Uses express-validator query() with custom boundary checks.
 * How the frontend consumes this API:
 * Frontend passes `?minLat=18.90&maxLat=19.10&minLng=72.80&maxLng=72.90`.
 */
const validateBoundingBoxRules = [
  query('minLat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('minLat must be a valid latitude between -90 and 90.')
    .toFloat(),
  query('maxLat')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('maxLat must be a valid latitude between -90 and 90.')
    .toFloat(),
  query('minLng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('minLng must be a valid longitude between -180 and 180.')
    .toFloat(),
  query('maxLng')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('maxLng must be a valid longitude between -180 and 180.')
    .toFloat(),
  query().custom((q) => {
    const hasAny = q.minLat !== undefined || q.maxLat !== undefined || q.minLng !== undefined || q.maxLng !== undefined;
    const hasAll = q.minLat !== undefined && q.maxLat !== undefined && q.minLng !== undefined && q.maxLng !== undefined;
    if (hasAny && !hasAll) {
      throw new Error('Bounding box search requires all 4 parameters: minLat, maxLat, minLng, and maxLng.');
    }
    if (hasAll) {
      if (Number(q.minLat) > Number(q.maxLat)) {
        throw new Error('minLat cannot be greater than maxLat.');
      }
      if (Number(q.minLng) > Number(q.maxLng)) {
        throw new Error('minLng cannot be greater than maxLng.');
      }
    }
    return true;
  }),
];

/**
 * What this code is doing:
 * Validates `:h3Index` URL parameter to ensure it is a valid 15-character H3 hex string.
 * Why it is needed:
 * Prevents invalid H3 index strings from hitting MongoDB database queries.
 * Which existing module is being reused:
 * Uses h3-js isValidCell utility and express-validator param().
 * How the frontend consumes this API:
 * Frontend calls `GET /api/danger-zones/8928308280fffff`.
 */
const validateH3IndexRules = [
  param('h3Index')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('H3 Index URL parameter is required.')
    .isString()
    .trim()
    .custom((val) => {
      if (!h3.isValidCell(val)) {
        throw new Error(`Invalid H3 Index format: '${val}'. Expected a valid 15-character hex string.`);
      }
      return true;
    }),
];

// ─── Shared result handler ─────────────────────────────────────────────────────

/**
 * Purpose of this middleware:
 * Collect any validation errors accumulated by the rules above and short-
 * circuit the request with a structured 400 response.
 */
const validateCoordinateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for request parameters.',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};

module.exports = {
  validateCoordinateRules,
  validateNearbyRules,
  validateBoundingBoxRules,
  validateH3IndexRules,
  validateCoordinateRequest,
};
