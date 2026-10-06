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

// POST /api/geofence/events: events the phone raised offline with the shared state machine. History only.
const validateDeviceEventsRules = [
  body('events').isArray({ min: 1, max: 200 }).withMessage('events must be an array of 1 to 200 events.'),
  body('events.*.event').isIn(['ENTER', 'EXIT', 'ZONE_CHANGED']).withMessage('event must be ENTER, EXIT or ZONE_CHANGED.'),
  body('events.*.timestamp').isISO8601().withMessage('timestamp must be ISO 8601.'),
  body('events.*.h3Index').isString().isLength({ min: 10, max: 20 }).withMessage('h3Index is required.'),
  body('events.*.riskLevel').isString().isLength({ min: 1, max: 20 }).withMessage('riskLevel is required.'),
  body('events.*.totalRisk').optional({ nullable: true }).isFloat({ min: 0, max: 100 }).toFloat(),
  body('events.*.latitude').isFloat({ min: -90, max: 90 }).toFloat(),
  body('events.*.longitude').isFloat({ min: -180, max: 180 }).toFloat(),
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
  validateDeviceEventsRules,
  validateCheckGeofenceRules,
  validateSyncGeofenceRules,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
};
