const express = require('express');
const router = express.Router();

// Import the existing authentication middleware
const { verifyJWT } = require('../middleware/authMiddleware');

// Import the location controller methods
const { syncLocation, syncLocationBatch, getLatestLocation } = require('../controllers/locationController');
const { idempotent } = require('../middleware/idempotency');

// Import the validation rules and error-handling middleware
const { 
  validateLocationRules, 
  validateLocationBatchRules,
  validateLocationRequest 
} = require('../middleware/locationValidator');

/**
 * POST /api/location
 * Accepts a location payload, validates it, and saves it to the database.
 * Protected by JWT authentication.
 */
router.post(
  '/',
  verifyJWT,
  idempotent('location.single'),
  validateLocationRules,
  validateLocationRequest,
  syncLocation
);

/**
 * POST /api/location/batch
 * Points recorded while offline. Each point has its own idempotencyKey, so re-sending is harmless.
 */
router.post(
  '/batch',
  verifyJWT,
  idempotent('location.batch'),
  validateLocationBatchRules,
  validateLocationRequest,
  syncLocationBatch
);

/**
 * GET /api/location/latest
 * Retrieves the most recent recorded location for the authenticated user.
 * Protected by JWT authentication.
 */
router.get(
  '/latest',
  verifyJWT,
  getLatestLocation
);

module.exports = router;
