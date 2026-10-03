const express = require('express');
const { userLimiter } = require('../middleware/rateLimiters');
const { verifyJWT } = require('../middleware/authMiddleware');
const { getLocationRisk, getLiveRisk, getCells, getCell } = require('../controllers/risk.controller');
const { locationRules, liveRules, cellsRules, cellParamRules, validateRequest } = require('../validators/riskValidator');

const router = express.Router();

router.use(verifyJWT);

// Per-user limit on top of the global per-IP limit (the map polls these endpoints).
router.use(userLimiter({ windowMs: 60 * 1000, limit: 90, message: 'Too many risk requests, slow down.' }));

router.get('/location', locationRules, validateRequest, getLocationRisk);
router.get('/live', liveRules, validateRequest, getLiveRisk);
router.get('/cells', cellsRules, validateRequest, getCells);
router.get('/cell/:h3Index', cellParamRules, validateRequest, getCell);

module.exports = router;
