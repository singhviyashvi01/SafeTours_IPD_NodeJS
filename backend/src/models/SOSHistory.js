const mongoose = require('mongoose');

const sosHistorySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    journey: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Journey',
      // Optional — manual SOS can be triggered outside a journey
      default: null,
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
      required: [true, 'Location reference is required'],
    },
    type: {
      type: String,
      enum: {
        values: ['manual', 'automatic'],
        message: 'Type must be either "manual" or "automatic"',
      },
      required: [true, 'SOS type is required'],
    },
    status: {
      type: String,
      enum: {
        values: ['active', 'cancelled', 'resolved'],
        message: 'Status must be one of: active, cancelled, resolved',
      },
      default: 'active',
      index: true,
    },
    triggeredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    notifiedContacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'EmergencyContact',
      },
    ],
  },
  {
    // Mongoose automatically manages createdAt and updatedAt
    timestamps: true,
  }
);

// Compound index to quickly find a user's active SOS events
sosHistorySchema.index({ user: 1, status: 1 });

// Index for querying SOS events linked to a specific journey
sosHistorySchema.index({ journey: 1 });

// Index on triggeredAt for chronological history queries
sosHistorySchema.index({ triggeredAt: -1 });

const SOSHistory = mongoose.model('SOSHistory', sosHistorySchema);

module.exports = SOSHistory;
