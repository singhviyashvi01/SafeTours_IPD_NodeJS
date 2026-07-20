const { body, query, validationResult } = require('express-validator');
const { incidentCategories } = require('../config/communityConfig');

/**
 * Shared validator handler middleware to collect express-validator errors
 * and return a unified 400 response shape.
 */
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }
  next();
};

/**
 * Validation rules for creating a community incident report.
 */
const reportIncidentRules = [
  body('incidentType')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Incident type (incidentType) is required.')
    .isIn(Object.keys(incidentCategories))
    .withMessage(`Incident type must be one of: ${Object.keys(incidentCategories).join(', ')}`),

  body('description')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Description is required.')
    .isString()
    .withMessage('Description must be a string.')
    .trim()
    .isLength({ min: 5, max: 1000 })
    .withMessage('Description must be between 5 and 1000 characters.'),

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
];

/**
 * Validation rules for finding nearby incidents.
 * Accepts query parameters: latitude, longitude, and optional radius.
 */
const nearbyIncidentsRules = [
  query('latitude')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Latitude is required.')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90.')
    .toFloat(),

  query('longitude')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Longitude is required.')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180.')
    .toFloat(),

  query('radius')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Radius must be a positive number.')
    .toFloat(),
];

module.exports = {
  validateRequest,
  reportIncidentRules,
  nearbyIncidentsRules,
};
