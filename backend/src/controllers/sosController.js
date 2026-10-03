const sosService = require('../services/sosService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');

const keyOf = (req) => req.get('Idempotency-Key') || req.body.idempotencyKey || undefined;

// POST /api/sos
const createSOS = asyncHandler(async (req, res) => {
  const { location, journeyId, reason } = req.body;
  const out = await sosService.createManual(req.user._id, { location, journeyId, reason, idempotencyKey: keyOf(req) });
  const status = out.duplicate || out.escalatedPending ? 200 : 201;
  const message = out.escalatedPending
    ? 'Pending safety check escalated to an SOS.'
    : out.duplicate
      ? 'An SOS is already in progress; returning it.'
      : 'SOS sent.';
  return res.status(status).json({ ...new ApiResponse(status, out.record, message), duplicate: Boolean(out.duplicate) });
});

// GET /api/sos/pending
const getPending = asyncHandler(async (req, res) => {
  const pending = await sosService.getPending(req.user._id);
  return res.status(200).json(new ApiResponse(200, pending, pending ? 'Pending safety check.' : 'No pending safety check.'));
});

// GET /api/sos/active
const getActive = asyncHandler(async (req, res) => {
  const active = await sosService.getActive(req.user._id);
  return res.status(200).json(new ApiResponse(200, active, active ? 'Active SOS.' : 'No active SOS.'));
});

// POST /api/sos/:id/confirm   ("Send SOS now")
const confirmSOS = asyncHandler(async (req, res) => {
  const out = await sosService.confirm(req.user._id, req.params.id);
  return res.status(200).json(new ApiResponse(200, out.record, 'SOS sent.'));
});

// POST /api/sos/:id/cancel   ("I'm safe" for a pending check, cancel for an active SOS)
const cancelSOS = asyncHandler(async (req, res) => {
  const { reason, extendMinutes } = req.body;
  const out = await sosService.cancel(req.user._id, req.params.id, { reason, extendMinutes });
  return res.status(200).json(new ApiResponse(200, out.record, out.alreadyClosed ? 'Already closed.' : 'Cancelled.'));
});

// GET /api/sos/history
const getSOSHistory = asyncHandler(async (req, res) => {
  const history = await sosService.getSOSHistory(req.user._id);
  return res.status(200).json(new ApiResponse(200, history, 'SOS history retrieved successfully.'));
});

module.exports = { createSOS, getPending, getActive, confirmSOS, cancelSOS, getSOSHistory };
