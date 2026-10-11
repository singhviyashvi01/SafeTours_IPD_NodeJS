const { body, validationResult } = require('express-validator');
const cfg = require('../config/assistant.config');

const chatRules = [
  body('message').isString().withMessage('message must be text.').bail().trim()
    .isLength({ min: 1, max: cfg.maxMessageChars }).withMessage(`message must be 1 to ${cfg.maxMessageChars} characters.`),
  body('history').optional({ nullable: true }).isArray({ max: cfg.maxHistoryTurns }).withMessage(`history can hold at most ${cfg.maxHistoryTurns} turns.`),
  body('history.*.role').optional().isIn(['user', 'assistant']).withMessage('history role must be user or assistant.'),
  body('history.*.text').optional().isString().isLength({ max: 2000 }).withMessage('history text is too long.'),
  body('location').optional({ nullable: true }).isObject().withMessage('location must be an object.'),
  body('location.latitude').if(body('location').exists({ checkNull: true })).isFloat({ min: -90, max: 90 }).toFloat(),
  body('location.longitude').if(body('location').exists({ checkNull: true })).isFloat({ min: -180, max: 180 }).toFloat(),
  body('location.accuracy').optional({ nullable: true }).isFloat({ min: 0 }).toFloat(),
  body('connectivity').optional({ nullable: true }).isIn(['ONLINE', 'WEAK', 'OFFLINE']).withMessage('connectivity must be ONLINE, WEAK or OFFLINE.'),
];

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: 'Validation failed.', errors: errors.array().map((e) => ({ field: e.path, message: e.msg })) });
  }
  return next();
};

module.exports = { chatRules, validateRequest };
