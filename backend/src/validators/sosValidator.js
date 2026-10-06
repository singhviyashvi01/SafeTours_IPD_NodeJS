const { body, param, validationResult } = require('express-validator');

const objectId = (value) => {
  if (!/^[0-9a-fA-F]{24}$/.test(String(value))) throw new Error('Must be a valid 24-character id.');
  return true;
};

// POST /api/sos: the location travels in the body; locationId is no longer needed.
const validateCreateSOS = [
  body('location').optional({ nullable: true }).isObject().withMessage('location must be an object {latitude, longitude, accuracy?, timestamp?}.'),
  body('location.latitude').if(body('location').exists({ checkNull: true })).isFloat({ min: -90, max: 90 }).withMessage('location.latitude must be between -90 and 90.').toFloat(),
  body('location.longitude').if(body('location').exists({ checkNull: true })).isFloat({ min: -180, max: 180 }).withMessage('location.longitude must be between -180 and 180.').toFloat(),
  body('location.accuracy').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('location.accuracy must be metres.').toFloat(),
  body('location.timestamp').optional({ nullable: true }).isISO8601().withMessage('location.timestamp must be ISO 8601.'),
  body('journeyId').optional({ checkFalsy: true, nullable: true }).custom(objectId),
  body('reason').optional({ checkFalsy: true, nullable: true }).isString().trim().isLength({ max: 500 }).withMessage('reason must not exceed 500 characters.'),
  body('idempotencyKey').optional({ nullable: true }).isString().isLength({ min: 8, max: 128 }).withMessage('idempotencyKey must be 8-128 characters.'),
  // Offline delivery: when the user triggered it (phone clock) and what the phone already texted.
  body('clientCreatedAt').optional({ nullable: true }).isISO8601().withMessage('clientCreatedAt must be ISO 8601.'),
  body('sms').optional({ nullable: true }).isObject().withMessage('sms must be an object.'),
  body('sms.outcome').optional({ nullable: true }).isIn(['sent', 'partial', 'composer_opened', 'failed', 'no_permission', 'none', 'unavailable'])
    .withMessage('sms.outcome is not a known value.'),
  body('sms.sentTo').optional({ nullable: true }).isArray({ max: 20 }).withMessage('sms.sentTo must be an array of up to 20 phone numbers.'),
  body('sms.sentTo.*').optional().isString().isLength({ max: 32 }),
  body('sms.total').optional({ nullable: true }).isInt({ min: 0, max: 50 }).toInt(),
  body('sms.attemptedAt').optional({ nullable: true }).isISO8601(),
];

const validateSosId = [param('id').custom(objectId)];

const validateCancelSOS = [
  ...validateSosId,
  body('reason').optional({ checkFalsy: true, nullable: true }).isString().trim().isLength({ max: 500 }).withMessage('reason must not exceed 500 characters.'),
  body('extendMinutes').optional({ nullable: true }).isInt({ min: 1, max: 240 }).withMessage('extendMinutes must be 1-240.').toInt(),
];

const validateSOSRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for SOS request.',
      errors: errors.array().map((err) => ({ field: err.path, message: err.msg })),
    });
  }
  return next();
};

module.exports = { validateCreateSOS, validateSosId, validateCancelSOS, validateSOSRequest };
