const mongoose = require('mongoose');

/**
 * UserGeofenceState: per-user geofence state machine, persisted so that a server restart never
 * resets the dwell / hysteresis counters (see services/geofence/geofenceStateMachine.js).
 *
 * phase: SAFE | ENTERING | IN_DANGER | EXITING
 * lastReadingAt is also the optimistic-concurrency token: every write is conditional on it.
 */
const userGeofenceStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      unique: true,
      index: true,
    },
    phase: { type: String, enum: ['SAFE', 'ENTERING', 'IN_DANGER', 'EXITING'], default: 'SAFE' },
    dangerReadings: { type: Number, default: 0 },
    dangerSince: { type: Date, default: null },
    safeReadings: { type: Number, default: 0 },
    safeSince: { type: Date, default: null },
    lastReadingAt: { type: Date, default: null },

    currentH3: { type: String, trim: true, default: null },
    currentZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'GridCell', default: null },
    lastLevel: { type: String, default: null },
    lastScore: { type: Number, default: null },

    // Kept for existing consumers: true while IN_DANGER or EXITING.
    insideDangerZone: { type: Boolean, default: false },
    lastEvent: {
      type: String,
      enum: ['NONE', 'NO_CHANGE', 'ENTER', 'EXIT', 'ZONE_CHANGED'],
      default: 'NONE',
    },
    lastChecked: { type: Date, default: Date.now },

    // The "Are you safe?" decision for the current danger episode has been taken (prompted, or
    // deliberately suppressed): do not evaluate it again until the user leaves and re-enters.
    episodePrompted: { type: Boolean, default: false },

    // Set when the user cancels a geofence check: no new geofence prompt around cooldownCell until then.
    cooldownCell: { type: String, default: null },
    cooldownUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserGeofenceState', userGeofenceStateSchema);
