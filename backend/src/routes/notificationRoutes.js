const express = require('express');
const router = express.Router();

const { verifyJWT } = require('../middleware/authMiddleware');
const {
  getNotifications,
  registerDeviceToken,
} = require('../controllers/notificationController');

/**
 * GET /api/notifications
 * Returns all notifications for the authenticated user.
 */
router.get('/', verifyJWT, getNotifications);

/**
 * POST /api/notifications/token
 * Registers a Firebase device token for the authenticated user.
 * Body: { token: string, platform: "android" | "ios" }
 */
router.post('/token', verifyJWT, registerDeviceToken);

module.exports = router;
