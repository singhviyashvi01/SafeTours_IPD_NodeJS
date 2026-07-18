const Notification = require('../models/Notification');

class NotificationService {
  /**
   * Creates and persists a notification record.
   *
   * Called by SOS, Journey, Weather, or AI modules to log a notification
   * without duplicating write logic across controllers.
   *
   * @param {Object} params
   * @param {string}  params.userId   - ID of the user this notification belongs to
   * @param {string}  params.type     - One of: SOS | WEATHER | JOURNEY | AI
   * @param {string}  params.title    - Short notification heading
   * @param {string}  params.message  - Full notification body
   * @param {string}  [params.receiver] - Optional EmergencyContact ID
   * @param {Object}  [params.metadata] - Arbitrary extra context (location, sosId, etc.)
   * @returns {Promise<Object>} The saved Notification document
   */
  async createNotification({ userId, type, title, message, receiver = null, metadata = {} }) {
    const notification = await Notification.create({
      user: userId,
      type,
      title,
      message,
      receiver: receiver || null,
      status: 'pending',
      metadata,
    });

    // NOTE: Firebase push delivery will be wired here in a future phase.
    // For now the record is stored with status "pending" so the mobile client
    // can poll or the push layer can pick it up later.

    return notification;
  }

  /**
   * Returns all notifications for a user, newest first.
   *
   * @param {string} userId
   * @returns {Promise<Array>}
   */
  async getUserNotifications(userId) {
    return Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('receiver', 'name phone relationship')
      .exec();
  }
}

module.exports = new NotificationService();
