const mongoose = require('mongoose');
const { incidentCategories } = require('../config/communityConfig');

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

const incidentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    incidentType: {
      type: String,
      required: [true, 'Incident type is required'],
      enum: {
        values: Object.keys(incidentCategories),
        message: 'Invalid incident type. Must be one of the configurable categories.',
      },
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      minlength: [5, 'Description must be at least 5 characters'],
      maxlength: [1000, 'Description cannot exceed 1000 characters'],
    },
    latitude: {
      type: Number,
      required: [true, 'Latitude is required'],
      min: -90,
      max: 90,
    },
    longitude: {
      type: Number,
      required: [true, 'Longitude is required'],
      min: -180,
      max: 180,
    },
    location: {
      type: pointSchema,
      required: [true, 'Geospatial location is required'],
    },
    h3CellId: {
      type: String,
      required: [true, 'H3 Cell ID is required'],
      index: true,
      trim: true,
    },
    severity: {
      type: String,
      required: [true, 'Severity is required'],
      enum: {
        values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        message: 'Severity must be one of: LOW, MEDIUM, HIGH, CRITICAL',
      },
      index: true,
    },
    status: {
      type: String,
      required: [true, 'Status is required'],
      enum: {
        values: ['ACTIVE', 'EXPIRED', 'REMOVED'],
        message: 'Status must be one of: ACTIVE, EXPIRED, REMOVED',
      },
      default: 'ACTIVE',
      index: true,
    },
    confirmationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    falseReportCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: [true, 'Expiration date/time is required'],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// 2dsphere index for quick geospatial query (find nearby incidents)
incidentSchema.index({ location: '2dsphere' });

const Incident = mongoose.model('Incident', incidentSchema);

module.exports = Incident;
