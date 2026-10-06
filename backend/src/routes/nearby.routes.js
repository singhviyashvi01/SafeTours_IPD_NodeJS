const express = require('express');
const { verifyJWT } = require('../middleware/authMiddleware');
const { nearby: nearbyLimiter } = require('../middleware/rateLimiters');
const { getNearby } = require('../controllers/nearby.controller');
const { nearbyRules, validateRequest } = require('../validators/nearbyValidator');

const router = express.Router();

router.get('/', verifyJWT, nearbyLimiter, nearbyRules, validateRequest, getNearby);

module.exports = router;
