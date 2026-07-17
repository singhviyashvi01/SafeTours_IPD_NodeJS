const SOSHistory = require('../models/SOSHistory');
const Location = require('../models/Location');
const Journey = require('../models/Journey');
const EmergencyContact = require('../models/EmergencyContact');
const notificationService = require('./notificationService');
const ApiError = require('../utils/apiError');

class SOSService {
  /**
   * Triggers an SOS alert (either manual or automatic).
   * 
   * @param {string} userId - The authenticated user's ID
   * @param {Object} data - Contains locationId, optional journeyId, and optional reason
   * @param {string} type - The type of SOS ('manual' | 'automatic')
   * @returns {Promise<Object>} The created SOS history record
   */
  async triggerSOS(userId, data, type) {
    const { locationId, journeyId, reason } = data;

    // 1. Business Logic: Check if the user already has an active SOS
    const existingActiveSOS = await SOSHistory.findOne({ user: userId, status: 'active' }).exec();
    if (existingActiveSOS) {
      throw new ApiError(400, 'An active SOS alert is already in progress for this user.');
    }

    // 2. Fetch Location: Either by specified locationId or fall back to the user's latest location
    let locationDoc = null;
    if (locationId) {
      locationDoc = await Location.findOne({ _id: locationId, userId }).exec();
    }
    if (!locationDoc) {
      locationDoc = await Location.findOne({ userId }).sort({ timestamp: -1 }).exec();
    }

    if (!locationDoc) {
      throw new ApiError(404, 'No location record found. A valid location is required to trigger an SOS.');
    }

    // 3. Fetch active Journey (if any)
    let journeyDoc = null;
    if (journeyId) {
      journeyDoc = await Journey.findOne({ _id: journeyId, userId, status: 'ACTIVE' }).exec();
    }
    if (!journeyDoc) {
      journeyDoc = await Journey.findOne({ userId, status: 'ACTIVE' }).exec();
    }

    // For automatic SOS, a journey is typically required by business logic
    if (type === 'automatic' && !journeyDoc) {
      throw new ApiError(400, 'An active journey is required to trigger an automatic SOS.');
    }

    // 4. Fetch Emergency Contacts to notify
    const contacts = await EmergencyContact.find({ user: userId }).sort({ priority: 1, createdAt: -1 }).exec();
    if (!contacts || contacts.length === 0) {
      throw new ApiError(400, 'No emergency contacts found. Please add at least one emergency contact before triggering an SOS.');
    }
    const notifiedContactIds = contacts.map(contact => contact._id);

    // 5. Create SOSHistory record
    const sosRecord = await SOSHistory.create({
      user: userId,
      journey: journeyDoc ? journeyDoc._id : null,
      location: locationDoc._id,
      type,
      status: 'active',
      triggeredAt: new Date(),
      reason: reason || '',
      notifiedContacts: notifiedContactIds,
    });

    // 6. Log a notification record for this SOS trigger
    // Fire-and-forget: notification failure must not roll back the SOS event
    notificationService.createNotification({
      userId,
      type: 'SOS',
      title: 'Emergency SOS Activated',
      message: `An ${type} SOS alert was triggered${journeyDoc ? ' during your active journey' : ''}. Emergency contacts have been notified.`,
      metadata: {
        sosId: sosRecord._id,
        sosType: type,
        locationId: locationDoc._id,
        coordinates: locationDoc.location?.coordinates ?? null,
        journeyId: journeyDoc ? journeyDoc._id : null,
        triggeredAt: sosRecord.triggeredAt,
      },
    }).catch((err) => {
      // Log the error but do not throw — SOS record is already safely persisted
      console.error('[NotificationService] Failed to create SOS notification:', err.message);
    });

    return sosRecord;
  }

  /**
   * Cancels an active SOS alert.
   * 
   * @param {string} userId - The authenticated user's ID
   * @param {string} sosId - The ID of the SOS event to cancel
   * @param {string} reason - Optional reason for cancelling
   * @returns {Promise<Object>} The updated SOS history record
   */
  async cancelSOS(userId, sosId, reason) {
    // 1. Fetch only an active SOS belonging to the authenticated user
    const sosRecord = await SOSHistory.findOne({ _id: sosId, user: userId, status: 'active' }).exec();
    if (!sosRecord) {
      throw new ApiError(404, 'No active SOS alert found for this ID.');
    }

    // 2. Update status and cancelled timestamp
    sosRecord.status = 'cancelled';
    sosRecord.cancelledAt = new Date();
    if (reason !== undefined) {
      sosRecord.reason = reason;
    }

    await sosRecord.save();
    return sosRecord;
  }

  /**
   * Retrieves SOS history for a user, sorted newest first.
   * 
   * @param {string} userId - The user's ID
   * @returns {Promise<Array>} List of SOSHistory records
   */
  async getSOSHistory(userId) {
    return await SOSHistory.find({ user: userId })
      .sort({ triggeredAt: -1 })
      .populate('location')
      .populate('journey')
      .populate('notifiedContacts')
      .exec();
  }
}

module.exports = new SOSService();
