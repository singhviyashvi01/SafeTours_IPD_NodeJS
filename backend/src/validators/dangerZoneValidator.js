const { query, validationResult } = require('express-validator');

/**
 * DangerZone Validator — SafeTours IPD
 *
 * Purpose of this file:
 * Define and export reusable validation rule chains and a result-handler
 * middleware for all DangerZone endpoints that accept lat/lng query params.
 *
 * Why express-validator instead of manual checks:
 * Matches the pattern used in locationValidator.js and sosValidator.js.
 * Keeps validation declarative and the controller completely free of
 * repetitive guard clauses.
 */

// ─── Reusable coordinate rules (query params) ─────────────────────────────────

/**
 * Purpose of these rules:
 * Validate `lat` and `lng` as required, finite, in-range floating-point
 * query parameters before the request reaches the controller or service.
 *
 * Why query() instead of body():
 * All three DangerZone endpoints receive coordinates in the URL query string
 * (e.g. ?lat=18.9&lng=72.8), not in the request body.
 */
const validateCoordinateRules = [
  query('lat')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Latitude (lat) is required.')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90.')
    .toFloat(), // Coerce to a JS Number so controllers receive the right type

  query('lng')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Longitude (lng) is required.')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180.')
    .toFloat(),
];

// ─── Shared result handler ─────────────────────────────────────────────────────

/**
 * Purpose of this middleware:
 * Collect any validation errors accumulated by the rules above and short-
 * circuit the request with a structured 400 response — matching the exact
 * shape used in locationValidator.js and sosValidator.js.
 *
 * Why a shared handler:
 * All coordinate-accepting endpoints use the same error shape. One function
 * means one place to change if the error format ever evolves.
 */
const validateCoordinateRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for coordinate parameters.',
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
  validateCoordinateRequest,
};
