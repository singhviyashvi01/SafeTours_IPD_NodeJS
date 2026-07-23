const { body, query, validationResult } = require('express-validator');

/**
 * Geofence Validator — SafeTours IPD
 *
 * Validates request payload parameters for Geofence endpoints.
 */
const validateCheckGeofenceRules = [
  body('latitude')
    .exists({ checkNull: true })
    .withMessage('Latitude is required.')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90.')
    .toFloat(),

  body('longitude')
    .exists({ checkNull: true })
    .withMessage('Longitude is required.')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180.')
    .toFloat(),

  body('userId')
    .optional()
    .isString()
    .trim(),
];

const validateSyncGeofenceRules = [
  body('locations')
    .isArray({ min: 1 })
    .withMessage('Locations must be a non-empty array.'),

  body('locations.*.latitude')
    .exists({ checkNull: true })
    .withMessage('Latitude is required for all location items.')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90.')
    .toFloat(),

  body('locations.*.longitude')
    .exists({ checkNull: true })
    .withMessage('Longitude is required for all location items.')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180.')
    .toFloat(),

  body('locations.*.timestamp')
    .optional()
    .isISO8601()
    .withMessage('Timestamp must be a valid ISO8601 string.'),

  body('userId')
    .optional()
    .isString()
    .trim(),
];

const validateGeofenceQueryRules = [
  query('userId')
    .optional()
    .isString()
    .trim(),
];

/**
 * Middleware that inspects validation result and handles validation errors.
 */
const validateGeofenceRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for geofence parameters.',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};

module.exports = {
  validateCheckGeofenceRules,
  validateSyncGeofenceRules,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
};
