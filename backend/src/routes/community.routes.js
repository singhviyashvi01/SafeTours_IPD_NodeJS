const express = require('express');
const router = express.Router();

const { verifyJWT } = require('../middleware/authMiddleware');
const {
  reportIncident,
  getNearbyIncidents,
  confirmIncident,
  reportFalse,
  getIncidentDetails,
  getMyReports,
} = require('../controllers/community.controller');

const {
  reportIncidentRules,
  nearbyIncidentsRules,
  validateRequest,
} = require('../validators/communityValidator');

// Apply JWT verification middleware globally to all community intelligence endpoints
router.use(verifyJWT);

/**
 * POST /api/community/report
 * Create a new community incident report
 */
router.post('/report', reportIncidentRules, validateRequest, reportIncident);

/**
 * GET /api/community/nearby
 * Retrieve active incidents within a given radius
 */
router.get('/nearby', nearbyIncidentsRules, validateRequest, getNearbyIncidents);

/**
 * GET /api/community/my-reports
 * Retrieve all incidents reported by the currently authenticated user
 * NOTE: Placed before /:incidentId to prevent route parameter collision
 */
router.get('/my-reports', getMyReports);

/**
 * GET /api/community/:incidentId
 * Retrieve full details of a specific incident
 */
router.get('/:incidentId', getIncidentDetails);

/**
 * POST /api/community/:incidentId/confirm
 * Confirm the validity of a reported incident
 */
router.post('/:incidentId/confirm', confirmIncident);

/**
 * POST /api/community/:incidentId/report-false
 * Flag a reported incident as false
 */
router.post('/:incidentId/report-false', reportFalse);

module.exports = router;
