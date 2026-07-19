const express = require('express');
const router = express.Router();
const { getCrowdScore } = require('../controllers/crowd.controller');

/**
 * Purpose of this route file:
 * Register the crowd intelligence endpoints with the existing API structure.
 *
 * Why this exists:
 * The crowd intelligence module is intentionally isolated so it can be consumed by the
 * frontend and later by the risk engine without changing existing routes.
 */
router.get('/score', getCrowdScore);

module.exports = router;
