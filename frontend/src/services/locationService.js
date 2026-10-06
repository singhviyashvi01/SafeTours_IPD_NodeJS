import { apiClient, formatApiError } from './apiClient';
import { sendOrQueue } from './outbox';
import { outboxRunner } from './outboxRunner';

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

    // Sent now, or stored in the SQLite outbox under the same idempotency key and uploaded in batches
    // (POST /location/batch) when the connection returns: nothing is lost and nothing is stored twice.
    const res = await sendOrQueue({
      type: 'location_point',
      payload: { channel: 'track', ...payload },
      createdAt: new Date(payload.timestamp).getTime() || Date.now(),
      send: (key) => apiClient.post('/location', payload, { headers: { 'Idempotency-Key': key } }),
    });
    if (res.success) return { success: true, data: res.response.data?.data || res.response.data };
    if (res.queued) return { success: false, queued: true, data: null, error: { message: 'Saved offline; it will upload when you are back online.', status: 0 } };
    return { success: false, data: null, error: res.error };
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
    return outboxRunner.getSummary().byType.location_point || 0;
  },
};
