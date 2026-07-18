const mongoose = require('mongoose');

// Reusable GeoJSON Point schema for consistency across location fields
const pointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true,
    default: 'Point'
  },
  coordinates: {
    type: [Number], // [longitude, latitude]
    required: true
  }
}, { _id: false });

const journeySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  startLocation: {
    type: pointSchema,
    required: true
  },
  destination: {
    type: pointSchema,
    required: true
  },
  startTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  expectedArrivalTime: {
    type: Date,
    required: true,
    // Indexed because SOS background jobs will query this heavily (e.g., ETA < Now)
    index: true 
  },
  lastKnownLocation: {
    type: pointSchema,
    // Updated frequently during the journey by the Location Service
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
    default: 'ACTIVE',
    index: true
  },
  endTime: {
    type: Date,
    // Set only when status changes to COMPLETED or CANCELLED
  },
  // Future fields are cleanly isolated in a metadata object
  metadata: {
    route: {
      type: String, // E.g., an Encoded Polyline string to draw the path on a map
    },
    distanceTravelled: {
      type: Number, // In meters
    },
    travelDuration: {
      type: Number, // In seconds
    },
    riskScore: {
      type: Number, // Scaled 0-100 indicating danger level of the route
    },
    autoSOSTriggered: {
      type: Boolean,
      default: false
    },
    journeyType: {
      type: String // E.g., 'WALKING', 'DRIVING', 'GUIDED_TOUR'
    }
  }
}, {
  // Mongoose automatically manages createdAt and updatedAt
  timestamps: true 
});

// Compound index to instantly find if a user has an ongoing journey
journeySchema.index({ userId: 1, status: 1 });

// Geospatial indexes allow fast proximity queries ($geoNear, $geoWithin)
journeySchema.index({ destination: '2dsphere' });
journeySchema.index({ lastKnownLocation: '2dsphere' });

const Journey = mongoose.model('Journey', journeySchema);

module.exports = Journey;
