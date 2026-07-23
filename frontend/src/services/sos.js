import { apiClient, formatApiError } from './apiClient';

/**
 * Service for interacting with backend SOS emergency endpoints.
 */
export const sosService = {
  /**
   * Triggers a manual SOS emergency broadcast.
   * @param {Object} payload - { location: { type: 'Point', coordinates: [lng, lat] }, details }
   */
  async triggerManual(payload) {
    try {
      const response = await apiClient.post('/sos/manual', payload);
      return {
        success: true,
        data: response.data?.data || response.data || null,
        message: response.data?.message || 'Manual SOS triggered successfully.',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Triggers an automatic SOS alert (e.g., ETA breach, route deviation).
   * @param {Object} payload - { location: { type: 'Point', coordinates: [lng, lat] }, triggerReason }
   */
  async triggerAutomatic(payload) {
    try {
      const response = await apiClient.post('/sos/automatic', payload);
      return {
        success: true,
        data: response.data?.data || response.data || null,
        message: response.data?.message || 'Automatic SOS triggered successfully.',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Cancels an active SOS alert.
   * @param {string} sosId
   * @param {string} reason
   */
  async cancel(sosId, reason = 'User cancelled emergency alert') {
    try {
      const response = await apiClient.post('/sos/cancel', { sosId, reason });
      return {
        success: true,
        data: response.data?.data || response.data || null,
        message: response.data?.message || 'SOS alert cancelled successfully.',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Fetches the user's SOS alert history.
   */
  async getHistory() {
    try {
      const response = await apiClient.get('/sos/history');
      const items = response.data?.data || response.data || [];
      return {
        success: true,
        data: Array.isArray(items) ? items : [],
        message: response.data?.message || '',
      };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: formatApiError(error),
      };
    }
  },

  /**
   * Helper alias for listing SOS history items
   */
  async list() {
    const res = await this.getHistory();
    return res.data || [];
  },

  /**
   * Helper alias for triggering manual SOS
   */
  async trigger(item) {
    return this.triggerManual(item);
  },
};
