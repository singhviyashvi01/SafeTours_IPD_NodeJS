const express = require('express');
const router = express.Router();
const { getEnvironmentNews, getFloodRisk, getEnvironmentalScore } = require('../controllers/environment.controller');

/**
 * Purpose of this route file:
 * Register the environmental risk endpoints with the existing API structure.
 *
 * Why this exists:
 * The environmental module is intentionally isolated so it can be consumed by the
 * frontend and later by the risk engine without changing existing routes.
 */
router.get('/news', getEnvironmentNews);
router.get('/flood', getFloodRisk);
router.get('/score', getEnvironmentalScore);

module.exports = router;
