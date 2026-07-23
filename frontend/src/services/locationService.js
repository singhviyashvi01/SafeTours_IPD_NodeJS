import { apiClient, formatApiError } from './apiClient';
import { offlineQueueManager } from '../utils/offlineQueueManager';

export const locationService = {
  /**
   * Sync a new GPS location point to the backend database
   */
  async syncLocation(locationData) {
    const payload = {
      latitude: Number(locationData.latitude),
      longitude: Number(locationData.longitude),
      accuracy: Number(locationData.accuracy || 10),
      speed: locationData.speed !== undefined ? Math.max(0, Number(locationData.speed)) : 0,
      heading: locationData.heading !== undefined ? Number(locationData.heading) : 0,
      timestamp: locationData.timestamp || new Date().toISOString(),
    };

    try {
      const response = await apiClient.post('/location', payload);

      // Successfully synced — attempt to flush any previous offline queued points
      offlineQueueManager.flushQueue(async (item) => {
        const res = await apiClient.post('/location', item);
        return { success: res.status === 201 || res.status === 200 };
      });

      return {
        success: true,
        data: response.data?.data || response.data,
      };
    } catch (error) {
      const formatted = formatApiError(error);

      // If it's a network error (status 0 or no response), queue for offline sync
      if (formatted.status === 0 || !error.response) {
        offlineQueueManager.enqueue(payload);
      }

      return {
        success: false,
        data: null,
        error: formatted,
      };
    }
  },

  /**
   * Fetch the most recent recorded location point for the user
   */
  async getLatestLocation() {
    try {
      const response = await apiClient.get('/location/latest');
      return {
        success: true,
        location: response.data?.location || null,
        message: response.data?.message || '',
      };
    } catch (error) {
      return {
        success: false,
        location: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Get size of offline queue
   */
  getOfflineQueueSize() {
    return offlineQueueManager.getQueueSize();
  },
};
