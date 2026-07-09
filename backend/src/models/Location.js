const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // MongoDB requires GeoJSON format for spatial indexing
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
        required: true,
      },
      coordinates: {
        type: [Number], // Must be exactly [longitude, latitude]
        required: true,
      },
    },
    accuracy: {
      type: Number,
      required: true,
      min: 0, // In meters
    },
    speed: {
      type: Number,
      default: 0,
      min: 0, // In meters/second
    },
    heading: {
      type: Number,
      min: 0,
      max: 360, // 0 is North, 90 is East, etc.
    },
    timestamp: {
      type: Date,
      required: true,
      // Helps query time-series data quickly
      index: true,
    },
    // A nested metadata object allows clean additions of future fields
    metadata: {
      tripId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trip',
        index: true, // Index if we plan to query all points for a specific trip
      },
      altitude: {
        type: Number,
      },
      networkType: {
        type: String, // e.g., 'WIFI', '4G', 'OFFLINE'
      },
      battery: {
        type: Number,
        min: 0,
        max: 100,
      },
      h3Index: {
        type: String,
        index: true, // For Uber-style hexagonal density queries
      },
      isMockLocation: {
        type: Boolean,
        default: false,
      },
    },
  },
  {
    // Mongoose will automatically manage createdAt and updatedAt fields
    timestamps: true,
  }
);

// 2dsphere index enables geographical queries ($geoNear, $geoWithin)
locationSchema.index({ location: '2dsphere' });

// Compound index to quickly fetch a specific user's location history chronologically
locationSchema.index({ userId: 1, timestamp: -1 });

const Location = mongoose.model('Location', locationSchema);

module.exports = Location;
