const mongoose = require('mongoose');

const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [longitude, latitude] — GeoJSON standard
      required: true,
    },
  },
  { _id: false }
);

/**
 * GeofenceEvent Model — SafeTours IPD
 *
 * Persists historical geofence transition events (ENTER, EXIT, ZONE_CHANGED).
 */
const geofenceEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    event: {
      type: String,
      enum: ['ENTER', 'EXIT', 'ZONE_CHANGED', 'NO_CHANGE', 'NONE'],
      required: [true, 'Event type is required'],
      index: true,
    },
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GridCell',
      default: null,
    },
    previousZone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GridCell',
      default: null,
    },
    riskLevel: {
      type: String,
      required: true,
      trim: true,
    },
    totalRisk: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    location: {
      type: pointSchema,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // True for events replayed from an offline batch that were already old when processed.
    // They are history only and never start an SOS prompt.
    historical: { type: Boolean, default: false },
    // 'device' for events the phone raised offline and uploaded later, 'server' when derived by the server.
    source: { type: String, enum: ['server', 'device'], default: 'server' },
    // userId + event + timestamp + cell: re-sending the same batch never duplicates history.
    idempotencyKey: { type: String, default: undefined },
  },
  {
    timestamps: true,
  }
);

geofenceEventSchema.index({ location: '2dsphere' });
geofenceEventSchema.index({ userId: 1, timestamp: -1 });
geofenceEventSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('GeofenceEvent', geofenceEventSchema);
