const express = require('express');
const router = express.Router();
const {
  checkGeofence,
  syncGeofenceLocations,
  getGeofenceStatus,
  getGeofenceHistory,
} = require('./geofence.controller');
const {
  validateCheckGeofenceRules,
  validateSyncGeofenceRules,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
} = require('./geofence.validator');
const { verifyJWT } = require('../../middleware/authMiddleware');

/**
 * Middleware: Flexible JWT authentication.
 * Verifies JWT token if present in headers or cookies; otherwise permits requests with userId in body or query for testing.
 */
const flexibleAuth = (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  if (token) {
    return verifyJWT(req, res, next);
  }

  if ((req.body && req.body.userId) || (req.query && req.query.userId)) {
    return next();
  }

  // Delegate to verifyJWT to issue standardized 401 response when unauthenticated
  return verifyJWT(req, res, next);
};

/**
 * POST /api/geofence/check
 * Continuously process live location updates and generate geofence events.
 */
router.post(
  '/check',
  flexibleAuth,
  validateCheckGeofenceRules,
  validateGeofenceRequest,
  checkGeofence
);

/**
 * POST /api/geofence/sync
 * Performs offline batch synchronization for multiple stored GPS points chronologically.
 */
router.post(
  '/sync',
  flexibleAuth,
  validateSyncGeofenceRules,
  validateGeofenceRequest,
  syncGeofenceLocations
);

/**
 * GET /api/geofence/status
 * Returns current geofence monitoring status (current zone, risk, H3 cell, inside zone status, last event).
 */
router.get(
  '/status',
  flexibleAuth,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
  getGeofenceStatus
);

/**
 * GET /api/geofence/history
 * Returns full geofence event log history for the user.
 */
router.get(
  '/history',
  flexibleAuth,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
  getGeofenceHistory
);

module.exports = router;
