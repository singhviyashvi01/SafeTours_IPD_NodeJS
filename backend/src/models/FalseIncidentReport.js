const mongoose = require('mongoose');

const falseIncidentReportSchema = new mongoose.Schema(
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

// Create compound index ensuring a user can flag a specific incident as false only once
falseIncidentReportSchema.index({ incidentId: 1, userId: 1 }, { unique: true });

const FalseIncidentReport = mongoose.model('FalseIncidentReport', falseIncidentReportSchema);

module.exports = FalseIncidentReport;
