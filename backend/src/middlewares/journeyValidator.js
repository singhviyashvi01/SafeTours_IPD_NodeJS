const { body, validationResult } = require('express-validator');

/**
 * Helper function to validate if an array is a valid [longitude, latitude] pair.
 */
const isValidCoordinatePair = (value) => {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error('Must be an array of exactly two numbers.');
  }
  const [lng, lat] = value;
  
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error('Coordinates must be numeric values.');
  }
  if (lng < -180 || lng > 180) {
    throw new Error('Longitude must be between -180 and 180.');
  }
  if (lat < -90 || lat > 90) {
    throw new Error('Latitude must be between -90 and 90.');
  }
  
  return true;
};

// Validation rules for starting a new journey
const validateStartJourney = [
  body('startLocation')
    .exists({ checkNull: true }).withMessage('startLocation is required.')
    .custom(isValidCoordinatePair),

  body('destination')
    .exists({ checkNull: true }).withMessage('destination is required.')
    .custom(isValidCoordinatePair),

  body('expectedArrivalTime')
    .exists({ checkNull: true }).withMessage('expectedArrivalTime is required.')
    .isISO8601().withMessage('expectedArrivalTime must be a valid ISO 8601 date string.')
    .toDate() // Cast to Date object
    .custom(value => {
      // Ensure the ETA is actually in the future
      if (value.getTime() <= Date.now()) {
        throw new Error('expectedArrivalTime must be a time in the future.');
      }
      return true;
    }),
];

// Validation rules for updating a journey's status (e.g., finishing or cancelling a trip)
const validateUpdateJourneyStatus = [
  body('status')
    .exists({ checkNull: true }).withMessage('status is required.')
    .isIn(['ACTIVE', 'COMPLETED', 'CANCELLED']).withMessage('status must be one of: ACTIVE, COMPLETED, CANCELLED.')
];

// Middleware to intercept validation errors and return a clean 400 response
const validateJourneyRequest = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for journey data.',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  
  next();
};

module.exports = {
  validateStartJourney,
  validateUpdateJourneyStatus,
  validateJourneyRequest
};
