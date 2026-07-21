// const mongoose = require('mongoose');

// const gridCellSchema = new mongoose.Schema(
//   {
//     h3Index: {
//       type: String,
//       required: true,
//       unique: true,
//       index: true,
//     },
//     geometry: {
//       type: {
//         type: String,
//         enum: ['Polygon'],
//         required: true,
//       },
//       coordinates: {
//         type: [[[Number]]], // Array of arrays of arrays of numbers [ [ [lng, lat], ... ] ]
//         required: true,
//       },
//     },
//     center: {
//       lat: {
//         type: Number,
//         required: true,
//       },
//       lng: {
//         type: Number,
//         required: true,
//       },
//     h3CellId: {
//       type: String,
//       required: [true, 'H3 Cell ID is required'],
//       unique: true,
//       index: true,
//       trim: true,
//     },
//     crimeScore: {
//       type: Number,
//       default: 0,
//       min: 0,
//       max: 100,
//     },
//     crowdScore: {
//       type: Number,
//       default: 0,
//       min: 0,
//       max: 100,
//     },
//     weatherScore: {
//       type: Number,
//       default: 0,
//       min: 0,
//       max: 100,
//     },
//     newsScore: {
//       type: Number,
//       default: 0,
//     },
//     totalRisk: {
//       type: Number,
//       default: 0,
//     },
//     level: {
//       type: String,
//       enum: ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'],
//       default: 'SAFE',
//     },
//   },
//   {
//     timestamps: true, // Automatically manages createdAt and updatedAt
//   }
// );

// // Add 2dsphere index for geospatial queries on the hexagon boundaries
// gridCellSchema.index({ geometry: '2dsphere' });
// // Add an index on center coordinates in case we want to search by center
// gridCellSchema.index({ 'center.lat': 1, 'center.lng': 1 });

//       min: 0,
//       max: 100,
//     },
//     communityScore: {
//       type: Number,
//       default: 0,
//       min: 0,
//       max: 100,
//     },
//     totalRiskScore: {
//       type: Number,
//       default: 0,
//       min: 0,
//       max: 500, // Sum of 5 different risk scores, each 0-100.
//     },
//   },
//   {
//     timestamps: true,
//   }
// );

// const GridCell = mongoose.model('GridCell', gridCellSchema);

// module.exports = GridCell;

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
    },

    communityScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    ewsScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    totalRisk: {
      type: Number,
      default: 0,
    },

    totalRiskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100, // Normalized composite score (0-100) calculated by RiskEngineService
    },

    level: {
      type: String,
      enum: ['SAFE', 'LOW', 'MODERATE', 'HIGH', 'EXTREME'],
      default: 'SAFE',
    },
  },
  {
    timestamps: true,
  }
);

// Add 2dsphere index for geospatial queries on the hexagon boundaries
gridCellSchema.index({ geometry: '2dsphere' });

// Add an index on center coordinates in case we want to search by center
gridCellSchema.index({ 'center.lat': 1, 'center.lng': 1 });

const GridCell = mongoose.model('GridCell', gridCellSchema);

module.exports = GridCell;
