import { apiClient, formatApiError } from './apiClient';

/**
 * Service for interacting with backend Journey endpoints.
 */
export const journeyService = {
  /**
   * Starts a new active journey.
   * @param {Object} data - { startLocation: [lng, lat], destination: [lng, lat], expectedArrivalTime }
   */
  async start(data) {
    try {
      const response = await apiClient.post('/journey/start', data);
      return {
        success: true,
        journey: response.data?.journey || null,
        message: response.data?.message || 'Journey started successfully.',
      };
    } catch (error) {
      return {
        success: false,
        journey: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Updates an ongoing journey (ETA, location metadata).
   * @param {string} journeyId
   * @param {Object} updateData - { expectedArrivalTime, metadata }
   */
  async update(journeyId, updateData) {
    try {
      const response = await apiClient.post(`/journey/update/${journeyId}`, updateData);
      return {
        success: true,
        journey: response.data?.journey || null,
        message: response.data?.message || 'Journey updated successfully.',
      };
    } catch (error) {
      return {
        success: false,
        journey: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Terminates an active journey (COMPLETED or CANCELLED).
   * @param {string} journeyId
   * @param {string} status - 'COMPLETED' | 'CANCELLED'
   */
  async end(journeyId, status = 'COMPLETED') {
    try {
      const response = await apiClient.post(`/journey/end/${journeyId}`, { status });
      return {
        success: true,
        journey: response.data?.journey || null,
        message: response.data?.message || `Journey marked as ${status}.`,
      };
    } catch (error) {
      return {
        success: false,
        journey: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Retrieves the currently active journey for the user (if any).
   */
  async getActive() {
    try {
      const response = await apiClient.get('/journey/status');
      return {
        success: true,
        journey: response.data?.journey || null,
        message: response.data?.message || '',
      };
    } catch (error) {
      return {
        success: false,
        journey: null,
        error: formatApiError(error),
      };
    }
  },

  /**
   * Helper alias for listing user journey history/active journey
   */
  async list() {
    const res = await this.getActive();
    if (res.success && res.journey) {
      return [res.journey];
    }
    return [];
  },
};
