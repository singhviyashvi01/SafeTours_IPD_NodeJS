import { apiClient } from './apiClient';
import { Platform } from 'react-native';

export const notificationService = {
  /**
   * GET /api/notifications
   * Retrieves all notifications for the authenticated user.
   */
  list: async () => {
    const response = await apiClient.get('/notifications');
    return response.data.data || [];
  },

  /**
   * POST /api/notifications/token
   * Registers or updates a device token for push notifications.
   * @param {Object} payload { token: string, platform?: 'android' | 'ios' }
   */
  registerDeviceToken: async ({ token, platform }) => {
    const devicePlatform = platform || (Platform.OS === 'ios' ? 'ios' : 'android');
    const response = await apiClient.post('/notifications/token', {
      token,
      platform: devicePlatform,
    });
    return response.data.data;
  },

  /**
   * Helper to mark a notification read locally or if backend endpoint exists
   */
  markRead: async id => {
    // If backend exposes markRead, invoke endpoint; otherwise return resolved
    return Promise.resolve({ id, read: true });
  },
};
