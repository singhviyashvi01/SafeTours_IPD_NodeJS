const mongoose = require('mongoose');

/**
 * UserGeofenceState Model — SafeTours IPD
 *
 * Lightweight collection tracking the latest H3 cell, active DangerZone,
 * safety status, and geofence events (ENTER, EXIT, ZONE_CHANGED, NO_CHANGE, NONE) for a user.
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
    currentH3: {
      type: String,
      required: [true, 'Current H3 cell index is required'],
      trim: true,
    },
    currentZoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DangerZone',
      default: null,
    },
    insideDangerZone: {
      type: Boolean,
      default: false,
    },
    lastChecked: {
      type: Date,
      default: Date.now,
    },
    lastEvent: {
      type: String,
      enum: ['NONE', 'NO_CHANGE', 'ENTER', 'EXIT', 'ZONE_CHANGED'],
      default: 'NONE',
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('UserGeofenceState', userGeofenceStateSchema);
