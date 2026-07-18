const { body, validationResult } = require('express-validator');

/**
 * Helper: checks if a value is a valid MongoDB ObjectId hex string.
 */
const isValidObjectId = (value) => {
  if (!/^[0-9a-fA-F]{24}$/.test(value)) {
    throw new Error('Must be a valid 24-character ObjectId.');
  }
  return true;
};

// ─── Manual SOS ───────────────────────────────────────────────────────────────
const validateManualSOS = [
  body('locationId')
    .exists({ checkNull: true }).withMessage('locationId is required.')
    .isString().withMessage('locationId must be a string.')
    .custom(isValidObjectId),

  body('journeyId')
    .optional({ nullable: true })
    .isString().withMessage('journeyId must be a string.')
    .custom(isValidObjectId),

  body('reason')
    .optional()
    .isString().withMessage('reason must be a string.')
    .trim()
    .isLength({ max: 500 }).withMessage('reason must not exceed 500 characters.'),
];

// ─── Automatic SOS ────────────────────────────────────────────────────────────
const validateAutomaticSOS = [
  body('locationId')
    .exists({ checkNull: true }).withMessage('locationId is required.')
    .isString().withMessage('locationId must be a string.')
    .custom(isValidObjectId),

  body('journeyId')
    .exists({ checkNull: true }).withMessage('journeyId is required for automatic SOS.')
    .isString().withMessage('journeyId must be a string.')
    .custom(isValidObjectId),

  body('reason')
    .optional()
    .isString().withMessage('reason must be a string.')
    .trim()
    .isLength({ max: 500 }).withMessage('reason must not exceed 500 characters.'),
];

// ─── Cancel SOS ───────────────────────────────────────────────────────────────
const validateCancelSOS = [
  body('sosId')
    .exists({ checkNull: true }).withMessage('sosId is required.')
    .isString().withMessage('sosId must be a string.')
    .custom(isValidObjectId),

  body('reason')
    .optional()
    .isString().withMessage('reason must be a string.')
    .trim()
    .isLength({ max: 500 }).withMessage('reason must not exceed 500 characters.'),
];

// ─── Shared validation result handler ─────────────────────────────────────────
const validateSOSRequest = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed for SOS request.',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg,
      })),
    });
  }

  next();
};

module.exports = {
  validateManualSOS,
  validateAutomaticSOS,
  validateCancelSOS,
  validateSOSRequest,
};
