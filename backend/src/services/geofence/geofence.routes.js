const express = require('express');
const { verifyJWT } = require('../../middleware/authMiddleware');
const { geofence: geofenceLimiter } = require('../../middleware/rateLimiters');
const { idempotent } = require('../../middleware/idempotency');
const { checkGeofence, syncGeofenceLocations, recordDeviceEvents, getGeofenceStatus, getGeofenceHistory } = require('./geofence.controller');
const {
  validateCheckGeofenceRules,
  validateSyncGeofenceRules,
  validateDeviceEventsRules,
  validateGeofenceQueryRules,
  validateGeofenceRequest,
} = require('./geofence.validator');

const router = express.Router();

// Every geofence route requires a signed-in user; the user id is taken from the token only.
router.use(verifyJWT, geofenceLimiter);

router.post('/check', validateCheckGeofenceRules, validateGeofenceRequest, checkGeofence);
router.post('/sync', idempotent('geofence.sync'), validateSyncGeofenceRules, validateGeofenceRequest, syncGeofenceLocations);
router.post('/events', idempotent('geofence.events'), validateDeviceEventsRules, validateGeofenceRequest, recordDeviceEvents);
router.get('/status', validateGeofenceQueryRules, validateGeofenceRequest, getGeofenceStatus);
router.get('/history', validateGeofenceQueryRules, validateGeofenceRequest, getGeofenceHistory);

module.exports = router;
