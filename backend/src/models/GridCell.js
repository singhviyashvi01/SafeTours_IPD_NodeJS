const mongoose = require('mongoose');

const gridCellSchema = new mongoose.Schema(
  {
    h3Index: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    geometry: {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
      },
      coordinates: {
        type: [[[Number]]], // Array of arrays of arrays of numbers [ [ [lng, lat], ... ] ]
        required: true,
      },
    },
    center: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
    },
    crimeScore: {
      type: Number,
      default: 0,
    },
    crowdScore: {
      type: Number,
      default: 0,
    },
    weatherScore: {
      type: Number,
      default: 0,
    },
    newsScore: {
      type: Number,
      default: 0,
    },
    totalRisk: {
      type: Number,
      default: 0,
    },
    level: {
      type: String,
      enum: ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'],
      default: 'SAFE',
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// Add 2dsphere index for geospatial queries on the hexagon boundaries
gridCellSchema.index({ geometry: '2dsphere' });
// Add an index on center coordinates in case we want to search by center
gridCellSchema.index({ 'center.lat': 1, 'center.lng': 1 });

const GridCell = mongoose.model('GridCell', gridCellSchema);

module.exports = GridCell;
