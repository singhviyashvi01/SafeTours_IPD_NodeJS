const { body, validationResult } = require('express-validator');

/**
 * Crime Validator — SafeTours IPD
 */

const validateMapHotspotsRules = [
  body('hotspots')
    .exists({ checkNull: true, checkFalsy: true })
    .withMessage('Hotspots array is required.')
    .isArray({ min: 1 })
    .withMessage('Hotspots must be a non-empty array.'),
  
  body('hotspots.*.crimeScore')
    .exists({ checkNull: true })
    .withMessage('crimeScore is required for each hotspot.')
    .isNumeric()
    .withMessage('crimeScore must be a number.'),

  body('hotspots.*.polygon')
    .exists({ checkNull: true })
    .withMessage('polygon is required for each hotspot.')
    .isArray({ min: 3 })
    .withMessage('polygon must be an array of at least 3 coordinates (to form a valid boundary).'),
    
  body('hotspots.*.polygon.*')
    .isArray({ min: 2, max: 2 })
    .withMessage('Each polygon coordinate must be an array of [lat, lng].'),
    
  body('hotspots.*.polygon.*.0')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be a valid number between -90 and 90.'),
    
  body('hotspots.*.polygon.*.1')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be a valid number between -180 and 180.')
];

const validateCrimeRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for crime hotspot data.',
      errors: errors.array().map((err) => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};

module.exports = {
  validateMapHotspotsRules,
  validateCrimeRequest,
};
