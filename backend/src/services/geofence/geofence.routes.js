const express = require('express');
const { verifyJWT } = require('../../middleware/authMiddleware');
const { geofence: geofenceLimiter } = require('../../middleware/rateLimiters');
const { checkGeofence, syncGeofenceLocations, getGeofenceStatus, getGeofenceHistory } = require('./geofence.controller');
const {
  validateCheckGeofenceRules,
  validateSyncGeofenceRules,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
} = require('./geofence.validator');

const router = express.Router();

// Every geofence route requires a signed-in user; the user id is taken from the token only.
router.use(verifyJWT, geofenceLimiter);

router.post('/check', validateCheckGeofenceRules, validateGeofenceRequest, checkGeofence);
router.post('/sync', validateSyncGeofenceRules, validateGeofenceRequest, syncGeofenceLocations);
router.get('/status', validateGeofenceQueryRules, validateGeofenceRequest, getGeofenceStatus);
router.get('/history', validateGeofenceQueryRules, validateGeofenceRequest, getGeofenceHistory);

module.exports = router;
