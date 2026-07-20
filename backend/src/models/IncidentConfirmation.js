const mongoose = require('mongoose');

const incidentConfirmationSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Incident',
      required: [true, 'Incident ID is required'],
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only need track creation time
  }
);

// Create compound index ensuring a user can confirm a specific incident only once
incidentConfirmationSchema.index({ incidentId: 1, userId: 1 }, { unique: true });

const IncidentConfirmation = mongoose.model('IncidentConfirmation', incidentConfirmationSchema);

module.exports = IncidentConfirmation;
