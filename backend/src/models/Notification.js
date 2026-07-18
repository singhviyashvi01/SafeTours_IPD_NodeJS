const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    type: {
      type: String,
      enum: {
        values: ['SOS', 'WEATHER', 'JOURNEY', 'AI'],
        message: 'Type must be one of: SOS, WEATHER, JOURNEY, AI',
      },
      required: [true, 'Notification type is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Notification title is required'],
      trim: true,
    },
    message: {
      type: String,
      required: [true, 'Notification message is required'],
      trim: true,
    },
    // Optional: the emergency contact this notification targets
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmergencyContact',
      default: null,
    },
    status: {
      type: String,
      enum: {
        values: ['pending', 'sent', 'failed'],
        message: 'Status must be one of: pending, sent, failed',
      },
      default: 'pending',
      index: true,
    },
    // Flexible key-value store for module-specific context (location, sosId, etc.)
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Fetch all notifications for a user sorted by newest first
notificationSchema.index({ user: 1, createdAt: -1 });

// Useful for filtering by type within a user's notifications
notificationSchema.index({ user: 1, type: 1 });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
