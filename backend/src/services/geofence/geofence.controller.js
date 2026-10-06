const geofenceService = require('./geofence.service');
const asyncHandler = require('../../utils/asyncHandler');

/** POST /api/geofence/check: one live GPS reading. */
const checkGeofence = asyncHandler(async (req, res) => {
  const { latitude, longitude, accuracy, timestamp } = req.body;
  const data = await geofenceService.check(req.user._id, { latitude, longitude, accuracy, timestamp });
  return res.status(200).json({ success: true, ...data });
});

/** POST /api/geofence/sync: offline batch, replayed oldest first. */
const syncGeofenceLocations = asyncHandler(async (req, res) => {
  const data = await geofenceService.sync(req.user._id, req.body.locations);
  return res.status(200).json({
    success: true,
    message: `Processed ${data.accepted} of ${data.received} points, ${data.eventsGenerated} events (${data.historicalEvents} historical).`,
    data,
  });
});

/** POST /api/geofence/events: events raised on the phone while offline (history only, never an SOS). */
const recordDeviceEvents = asyncHandler(async (req, res) => {
  const out = await geofenceService.recordDeviceEvents(req.user._id, req.body.events);
  return res.status(200).json({
    success: true,
    message: `Stored ${out.inserted} of ${out.received} events (${out.duplicates} already known, ${out.rejected.length} rejected).`,
    data: out,
  });
});

/** GET /api/geofence/status */
const getGeofenceStatus = asyncHandler(async (req, res) => {
  const data = await geofenceService.getGeofenceStatus(req.user._id);
  return res.status(200).json({ success: true, message: 'Geofence status retrieved successfully.', data });
});

/** GET /api/geofence/history */
const getGeofenceHistory = asyncHandler(async (req, res) => {
  const data = await geofenceService.getGeofenceHistory(req.user._id);
  return res.status(200).json({ success: true, message: 'Geofence history retrieved successfully.', count: data.length, data });
});

module.exports = { checkGeofence, syncGeofenceLocations, recordDeviceEvents, getGeofenceStatus, getGeofenceHistory };
