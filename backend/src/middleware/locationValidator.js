const { body, validationResult } = require('express-validator');

// Validation rules for location data
const validateLocationRules = [
  body('latitude')
    .exists({ checkNull: true }).withMessage('Latitude is required.')
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be a valid number between -90 and 90.'),

  body('longitude')
    .exists({ checkNull: true }).withMessage('Longitude is required.')
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be a valid number between -180 and 180.'),

  body('accuracy')
    .exists({ checkNull: true }).withMessage('Accuracy is required.')
    .isFloat({ min: 0 }).withMessage('Accuracy must be a positive number representing meters.'),

  body('speed')
    .optional()
    .isFloat({ min: 0 }).withMessage('Speed must be a positive number in meters per second.'),

  body('heading')
    .optional()
    .isFloat({ min: 0, max: 360 }).withMessage('Heading must be a valid angle between 0 and 360 degrees.'),

  body('timestamp')
    .exists({ checkNull: true }).withMessage('Timestamp is required.')
    .isISO8601().withMessage('Timestamp must be a valid ISO 8601 date string.')
    .toDate(), // Casts the string to a JavaScript Date object
];

// POST /api/location/batch: points recorded while offline. Each carries the idempotencyKey made on the phone.
const validateLocationBatchRules = [
  body('points').isArray({ min: 1, max: 200 }).withMessage('points must be an array of 1 to 200 locations.'),
  body('points.*.idempotencyKey').isString().isLength({ min: 8, max: 128 }).withMessage('Each point needs an idempotencyKey (8-128 characters).'),
  body('points.*.latitude').exists({ checkNull: true }).isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90.').toFloat(),
  body('points.*.longitude').exists({ checkNull: true }).isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180.').toFloat(),
  body('points.*.accuracy').exists({ checkNull: true }).isFloat({ min: 0 }).withMessage('Accuracy must be a number of metres.').toFloat(),
  body('points.*.speed').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('points.*.heading').optional({ nullable: true }).isFloat({ min: 0, max: 360 }).toFloat(),
  body('points.*.timestamp').exists({ checkNull: true }).isISO8601().withMessage('Timestamp must be ISO 8601.'),
];

// Middleware to catch errors and return them cleanly
const validateLocationRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for location data.',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  
  next();
};

module.exports = {
  validateLocationBatchRules,
  validateLocationRules,
  validateLocationRequest
};
