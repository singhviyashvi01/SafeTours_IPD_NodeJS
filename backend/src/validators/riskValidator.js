const { query, param, validationResult } = require('express-validator');
const h3 = require('h3-js');
const ApiError = require('../utils/apiError');

const lat = (name = 'lat') =>
  query(name).exists({ checkNull: true, checkFalsy: true }).withMessage(`${name} is required.`)
    .isFloat({ min: -90, max: 90 }).withMessage(`${name} must be between -90 and 90.`).toFloat();

const lng = (name = 'lng') =>
  query(name).exists({ checkNull: true, checkFalsy: true }).withMessage(`${name} is required.`)
    .isFloat({ min: -180, max: 180 }).withMessage(`${name} must be between -180 and 180.`).toFloat();

const locationRules = [lat(), lng()];

const liveRules = [
  lat(),
  lng(),
  query('previousH3Index').optional().isString().custom((v) => h3.isValidCell(v.trim())).withMessage('previousH3Index must be a valid H3 index.'),
];

const cellsRules = [
  lat('minLat'),
  lat('maxLat'),
  lng('minLng'),
  lng('maxLng'),
  query('minLevel').optional().isIn(['SAFE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME']).withMessage('minLevel must be SAFE, LOW, MODERATE, HIGH or EXTREME.'),
  query('includeUnknown').optional().isBoolean().toBoolean(),
  query('compact').optional().isBoolean().toBoolean(),
  query('limit').optional().isInt({ min: 1, max: 3000 }).toInt(),
];

const cellParamRules = [
  param('h3Index').custom((v) => h3.isValidCell(v)).withMessage('h3Index must be a valid H3 cell index.'),
];

const validateRequest = (req, res, next) => {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((e) => ({ field: e.path, message: e.msg }));
  return next(new ApiError(400, 'Validation failed', errors));
};

module.exports = { locationRules, liveRules, cellsRules, cellParamRules, validateRequest };
