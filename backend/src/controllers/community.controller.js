const communityService = require('../services/community/community.service');
const ApiError = require('../utils/apiError');

/**
 * Report a new incident.
 * POST /api/community/report
 * Authenticated users only.
 */
const reportIncident = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const incidentData = req.body;

    const newIncident = await communityService.reportIncident(userId, incidentData);

    return res.status(201).json({
      success: true,
      message: 'Incident reported successfully.',
      data: newIncident,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve nearby active incidents.
 * GET /api/community/nearby
 * Accepts query parameters: latitude, longitude, radius (optional)
 */
const getNearbyIncidents = async (req, res, next) => {
  try {
    const { latitude, longitude, radius } = req.query;

    // Use default radius of 5000 meters (5km) if not specified
    const searchRadius = radius ? Number(radius) : 5000;

    const incidents = await communityService.getNearbyIncidents(latitude, longitude, searchRadius);

    return res.status(200).json({
      success: true,
      message: 'Nearby incidents retrieved successfully.',
      count: incidents.length,
      data: incidents,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Confirm a reported incident.
 * POST /api/community/:incidentId/confirm
 * Authenticated users only.
 */
const confirmIncident = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { incidentId } = req.params;

    const updatedIncident = await communityService.confirmIncident(incidentId, userId);

    return res.status(200).json({
      success: true,
      message: 'Incident confirmation logged successfully.',
      data: updatedIncident,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Report an incident as false.
 * POST /api/community/:incidentId/report-false
 * Authenticated users only.
 */
const reportFalse = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { incidentId } = req.params;

    const updatedIncident = await communityService.reportFalse(incidentId, userId);

    return res.status(200).json({
      success: true,
      message: 'Incident flagged as false report successfully.',
      data: updatedIncident,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve details of a specific incident.
 * GET /api/community/:incidentId
 */
const getIncidentDetails = async (req, res, next) => {
  try {
    const { incidentId } = req.params;

    const incident = await communityService.getIncidentDetails(incidentId);

    return res.status(200).json({
      success: true,
      message: 'Incident details retrieved successfully.',
      data: incident,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Retrieve all incidents reported by the logged-in user.
 * GET /api/community/my-reports
 * Authenticated users only.
 */
const getMyReports = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const reports = await communityService.getMyReports(userId);

    return res.status(200).json({
      success: true,
      message: 'My reported incidents retrieved successfully.',
      count: reports.length,
      data: reports,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  reportIncident,
  getNearbyIncidents,
  confirmIncident,
  reportFalse,
  getIncidentDetails,
  getMyReports,
};
