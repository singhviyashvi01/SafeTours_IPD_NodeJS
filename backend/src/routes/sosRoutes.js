const express = require('express');
const router = express.Router();

// Import existing auth middleware
const { verifyJWT } = require('../middleware/authMiddleware');

// Import validators
const {
  validateManualSOS,
  validateAutomaticSOS,
  validateCancelSOS,
  validateSOSRequest,
} = require('../validators/sosValidator');

// Import controller methods
const {
  triggerManualSOS,
  triggerAutomaticSOS,
  cancelSOS,
  getSOSHistory,
} = require('../controllers/sosController');

/**
 * POST /api/sos/manual
 * Triggers a manual SOS alert from the user.
 */
router.post(
  '/manual',
  verifyJWT,
  validateManualSOS,
  validateSOSRequest,
  triggerManualSOS
);

/**
 * POST /api/sos/automatic
 * Triggers an automatic SOS (e.g., ETA breach or anomaly detection).
 */
router.post(
  '/automatic',
  verifyJWT,
  validateAutomaticSOS,
  validateSOSRequest,
  triggerAutomaticSOS
);

/**
 * POST /api/sos/cancel
 * Cancels an active SOS event.
 */
router.post(
  '/cancel',
  verifyJWT,
  validateCancelSOS,
  validateSOSRequest,
  cancelSOS
);

/**
 * GET /api/sos/history
 * Retrieves the authenticated user's SOS history.
 */
router.get(
  '/history',
  verifyJWT,
  getSOSHistory
);

module.exports = router;
