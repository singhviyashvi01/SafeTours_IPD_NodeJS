const { query, validationResult } = require('express-validator');
const cfg = require('../config/nearby.config');
const ApiError = require('../utils/apiError');

const TYPES = Object.keys(cfg.types);

const nearbyRules = [
  query('lat').exists({ checkNull: true, checkFalsy: true }).withMessage('lat is required.')
    .isFloat({ min: -90, max: 90 }).withMessage('lat must be between -90 and 90.').toFloat(),
  query('lng').exists({ checkNull: true, checkFalsy: true }).withMessage('lng is required.')
    .isFloat({ min: -180, max: 180 }).withMessage('lng must be between -180 and 180.').toFloat(),
  query('radius').optional()
    .isInt({ min: cfg.radius.min, max: cfg.radius.max })
    .withMessage(`radius must be a whole number of metres between ${cfg.radius.min} and ${cfg.radius.max}.`).toInt(),
  query('limit').optional().isInt({ min: 1, max: cfg.limit.max }).withMessage(`limit must be 1-${cfg.limit.max}.`).toInt(),
  query('types').optional().custom((v) => {
    const list = String(v).split(',').map((t) => t.trim()).filter(Boolean);
    if (list.length === 0 || list.some((t) => !TYPES.includes(t))) {
      throw new Error(`types must be a comma separated list of: ${TYPES.join(', ')}`);
    }
    return true;
  }),
];

const validateRequest = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  return next(new ApiError(400, 'Validation failed', result.array().map((e) => ({ field: e.path, message: e.msg }))));
};

module.exports = { nearbyRules, validateRequest };
