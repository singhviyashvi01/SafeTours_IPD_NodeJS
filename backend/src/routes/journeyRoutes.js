const express = require('express');
const router = express.Router();

// Import existing auth middleware
const { verifyJWT } = require('../middleware/authMiddleware');

// Import controller methods
const {
  startJourney,
  updateJourney,
  endJourney,
  getJourneyStatus
} = require('../controllers/journeyController');

// Import validators
const {
  validateStartJourney,
  validateUpdateJourneyStatus,
  validateJourneyRequest
} = require('../middleware/journeyValidator');

/**
 * POST /api/journey/start
 * Starts a new journey. Validates coordinates and ETA.
 */
router.post(
  '/start',
  verifyJWT,
  validateStartJourney,
  validateJourneyRequest,
  startJourney
);

/**
 * POST /api/journey/update/:id
 * Updates an ongoing journey. 
 * Note: Added /:id to the route path to maintain RESTful resource targeting 
 * and to match the controller's expectation of `req.params.id`.
 */
router.post(
  '/update/:id',
  verifyJWT,
  updateJourney
);

/**
 * POST /api/journey/end/:id
 * Completes or cancels an active journey.
 * Validates that the payload contains a valid final status.
 */
router.post(
  '/end/:id',
  verifyJWT,
  validateUpdateJourneyStatus,
  validateJourneyRequest,
  endJourney
);

/**
 * GET /api/journey/status
 * Retrieves the user's currently active journey (if any).
 */
router.get(
  '/status',
  verifyJWT,
  getJourneyStatus
);

module.exports = router;
