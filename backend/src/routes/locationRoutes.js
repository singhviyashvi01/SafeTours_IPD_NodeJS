const express = require('express');
const router = express.Router();

// Import the existing authentication middleware
const { verifyJWT } = require('../middleware/authMiddleware');

// Import the location controller methods
const { syncLocation, getLatestLocation } = require('../controllers/locationController');

// Import the validation rules and error-handling middleware
const { 
  validateLocationRules, 
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
  validateLocationRules,
  validateLocationRequest,
  syncLocation
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
