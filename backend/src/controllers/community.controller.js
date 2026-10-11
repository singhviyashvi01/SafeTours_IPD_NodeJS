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

    // merged: an identical report from someone else nearby was just filed, so this one counted as a confirmation of it.
    const merged = Boolean(newIncident && newIncident.merged);
    return res.status(merged ? 200 : 201).json({
      success: true,
      message: merged ? 'A similar report already exists nearby: yours was counted as a confirmation.' : 'Incident reported successfully.',
      merged,
      data: newIncident,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * The report categories (the single list in config/communityConfig.js) so the app never keeps its own copy.
 * GET /api/community/categories
 */
const getCategories = async (req, res) => {
  const { incidentCategories, severityLabel } = require('../config/communityConfig');
  const data = Object.entries(incidentCategories).map(([name, c]) => ({ name, severity: severityLabel(c.severity), expiryHours: c.expiryHours }));
  return res.status(200).json({ success: true, count: data.length, data });
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
  getCategories,
  getNearbyIncidents,
  confirmIncident,
  reportFalse,
  getIncidentDetails,
  getMyReports,
};
