const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    token: {
      type: String,
      required: [true, 'Device token is required'],
      trim: true,
    },
    platform: {
      type: String,
      enum: {
        values: ['android', 'ios'],
        message: 'Platform must be either "android" or "ios"',
      },
      required: [true, 'Platform is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// One token entry per user + token combination (prevents duplicates on re-login)
deviceTokenSchema.index({ user: 1, token: 1 }, { unique: true });

// Query all active tokens for a user quickly
deviceTokenSchema.index({ user: 1, isActive: 1 });

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);

module.exports = DeviceToken;
