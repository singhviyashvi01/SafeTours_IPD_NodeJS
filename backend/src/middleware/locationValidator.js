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
  validateLocationRules,
  validateLocationRequest
};
