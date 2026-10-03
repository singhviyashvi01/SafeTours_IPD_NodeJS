const mongoose = require('mongoose');

/**
 * SOSHistory: one record per SOS / safety check.
 *
 * Lifecycle
 *   pending_confirmation  an "Are you safe?" check (geofence or Shadow Mode ETA). confirmBy is the
 *                         persisted deadline; the server escalates it when the deadline passes, even
 *                         across a restart (services/sosService.js processDue).
 *   active                contacts have been notified (user confirmed, deadline passed, or manual SOS)
 *   cancelled             the user said they are safe / cancelled
 *   resolved              closed (or auto-closed after sos.activeMaxHours)
 *
 * The location is stored INSIDE the record (coords), so an SOS never depends on /location having been
 * called first. `location` (a Location document id) is optional and only kept for old records.
 */
const sosHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: [true, 'User reference is required'], index: true },
    journey: { type: mongoose.Schema.Types.ObjectId, ref: 'Journey', default: null },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', default: null },

    coords: {
      latitude: { type: Number },
      longitude: { type: Number },
      accuracy: { type: Number, default: null },
      timestamp: { type: Date },
      approximate: { type: Boolean, default: false }, // true when taken from the journey/last known location
    },

    type: {
      type: String,
      enum: { values: ['manual', 'automatic'], message: 'Type must be either "manual" or "automatic"' },
      required: [true, 'SOS type is required'],
    },
    // MANUAL | GEOFENCE | SHADOW_MODE
    triggerSource: { type: String, default: 'MANUAL', trim: true, index: true },

    dangerZone: { type: mongoose.Schema.Types.ObjectId, ref: 'GridCell', default: null },
    riskLevel: { type: String, default: null },

    status: {
      type: String,
      enum: {
        values: ['pending_confirmation', 'active', 'cancelled', 'resolved'],
        message: 'Status must be one of: pending_confirmation, active, cancelled, resolved',
      },
      default: 'active',
      index: true,
    },
    confirmBy: { type: Date, default: null }, // deadline of a pending check
    escalatedAt: { type: Date, default: null },
    escalatedBy: { type: String, enum: ['user', 'timeout', null], default: null },

    triggeredAt: { type: Date, required: true, default: Date.now },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: String, default: null },
    cancelReason: { type: String, default: '' },
    resolvedAt: { type: Date, default: null },
    reason: { type: String, trim: true, default: '' },

    // Same key => same SOS. Sent by the client (Idempotency-Key header) or derived by the server.
    idempotencyKey: { type: String, default: undefined },

    notifiedContacts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'EmergencyContact' }],
    metadata: { type: Object, default: {} },
  },
  { timestamps: true }
);

sosHistorySchema.index({ user: 1, status: 1 });
sosHistorySchema.index({ journey: 1 });
sosHistorySchema.index({ triggeredAt: -1 });
// Deadline poller: pending checks whose confirmBy has passed.
sosHistorySchema.index({ status: 1, confirmBy: 1 });
// Retried requests with the same key never create a second record.
sosHistorySchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('SOSHistory', sosHistorySchema);
