const assistant = require('../services/assistant/assistant.service');
const Location = require('../models/Location');
const asyncHandler = require('../utils/asyncHandler');

const STORED_LOCATION_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * POST /api/assistant/chat
 * Body: { message, history?:[{role,text}], location?:{latitude,longitude,accuracy?}, connectivity? }
 * Never files a report: a reportProposal in the answer is only a suggestion the app asks the user to confirm.
 */
const chat = asyncHandler(async (req, res) => {
  const { message, history, connectivity } = req.body;
  let location = req.body.location || null;

  // No position in the request: use the last stored one if it is recent, never an invented one.
  if (!location) {
    const last = await Location.findOne({ userId: req.user._id }).sort({ timestamp: -1 }).lean();
    if (last && last.location && Date.now() - new Date(last.timestamp).getTime() <= STORED_LOCATION_MAX_AGE_MS) {
      location = { latitude: last.location.coordinates[1], longitude: last.location.coordinates[0], accuracy: last.accuracy };
    }
  }

  const out = await assistant.chat({ userId: req.user._id, message, history: history || [], location, connectivity: connectivity || null });
  res.status(200).json({ success: true, ...out });
});

module.exports = { chat };
