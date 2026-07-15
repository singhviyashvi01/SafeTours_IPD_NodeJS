const sosService = require('../services/sosService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

/**
 * POST /api/sos/manual
 * Triggers a manual SOS alert for the authenticated user.
 */
const triggerManualSOS = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const sosRecord = await sosService.triggerSOS(userId, req.body, 'manual');

  return res.status(201).json(
    new ApiResponse(201, sosRecord, 'Manual SOS triggered successfully.')
  );
});

/**
 * POST /api/sos/automatic
 * Triggers an automatic SOS alert for the authenticated user (e.g. ETA breach).
 */
const triggerAutomaticSOS = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const sosRecord = await sosService.triggerSOS(userId, req.body, 'automatic');

  return res.status(201).json(
    new ApiResponse(201, sosRecord, 'Automatic SOS triggered successfully.')
  );
});

/**
 * POST /api/sos/cancel
 * Cancels an active SOS event for the authenticated user.
 */
const cancelSOS = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const { sosId, reason } = req.body;
  const updatedSOS = await sosService.cancelSOS(userId, sosId, reason);

  return res.status(200).json(
    new ApiResponse(200, updatedSOS, 'SOS alert cancelled successfully.')
  );
});

/**
 * GET /api/sos/history
 * Retrieves the authenticated user's SOS history.
 */
const getSOSHistory = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const history = await sosService.getSOSHistory(userId);

  return res.status(200).json(
    new ApiResponse(200, history, 'SOS history retrieved successfully.')
  );
});

module.exports = {
  triggerManualSOS,
  triggerAutomaticSOS,
  cancelSOS,
  getSOSHistory,
};
