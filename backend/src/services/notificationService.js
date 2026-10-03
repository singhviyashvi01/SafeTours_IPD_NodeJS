const Notification = require('../models/Notification');
const pushService = require('./pushService');

class NotificationService {
  /** Stores an in-app notification (always) without sending a push. */
  async createNotification({ userId, type, title, message, receiver = null, metadata = {}, status = 'pending' }) {
    return Notification.create({
      user: userId,
      type,
      title,
      message,
      receiver: receiver || null,
      status,
      metadata,
    });
  }

  /**
   * Stores the in-app notification AND sends an Expo push. The notification is marked "sent" or
   * "failed" according to the push result; it is stored either way, so the in-app list / polling
   * still shows it when push is unavailable (Expo Go on Android, no token, offline).
   */
  async notify({ userId, type, title, message, metadata = {}, channelId = 'safety', ttl }) {
    const push = await pushService.sendToUser(userId, {
      title,
      body: message,
      data: { type, ...metadata },
      channelId,
      ttl,
    });
    const notification = await this.createNotification({
      userId,
      type,
      title,
      message,
      metadata: { ...metadata, push },
      status: push.sent > 0 ? 'sent' : 'failed',
    });
    return { notification, push };
  }

  async getUserNotifications(userId) {
    return Notification.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate('receiver', 'name phone relationship')
      .exec();
  }
}

module.exports = new NotificationService();
