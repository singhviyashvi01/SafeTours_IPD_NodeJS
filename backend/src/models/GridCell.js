const mongoose = require('mongoose');

const gridCellSchema = new mongoose.Schema(
  {
    h3CellId: {
      type: String,
      required: [true, 'H3 Cell ID is required'],
      unique: true,
      index: true,
      trim: true,
    },
    crimeScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    crowdScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    weatherScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    newsScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    communityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    totalRiskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 500, // Sum of 5 different risk scores, each 0-100.
    },
  },
  {
    timestamps: true,
  }
);

const GridCell = mongoose.model('GridCell', gridCellSchema);

module.exports = GridCell;
