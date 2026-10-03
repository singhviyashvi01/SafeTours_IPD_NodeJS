const { body, validationResult } = require('express-validator');

/**
 * Validation for /api/geofence/*. The user always comes from the verified JWT: a client-supplied
 * userId is never read.
 */
const reading = (prefix = '') => [
  body(`${prefix}latitude`).exists({ checkNull: true }).withMessage('Latitude is required.')
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90.').toFloat(),
  body(`${prefix}longitude`).exists({ checkNull: true }).withMessage('Longitude is required.')
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180.').toFloat(),
  body(`${prefix}accuracy`).optional({ nullable: true }).isFloat({ min: 0, max: 100000 })
    .withMessage('accuracy must be a number of metres.').toFloat(),
  body(`${prefix}timestamp`).optional({ nullable: true }).isISO8601()
    .withMessage('timestamp must be an ISO 8601 string.'),
];

const validateCheckGeofenceRules = [...reading()];

const validateSyncGeofenceRules = [
  body('locations').isArray({ min: 1, max: 500 }).withMessage('locations must be an array of 1 to 500 points.'),
  ...reading('locations.*.'),
];

const validateGeofenceQueryRules = [];

const validateGeofenceRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for geofence parameters.',
      errors: errors.array().map((err) => ({ field: err.path, message: err.msg })),
    });
  }
  return next();
};

module.exports = {
  validateCheckGeofenceRules,
  validateSyncGeofenceRules,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
};
