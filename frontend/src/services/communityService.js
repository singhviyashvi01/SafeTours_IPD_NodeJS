import { apiClient, formatApiError } from './apiClient';

/**
 * Service for interacting with backend Community Incident endpoints.
 */
export const communityService = {
  /**
   * Reports a new community incident.
   * @param {Object} payload - { incidentType, description, latitude, longitude }
   */
  async reportIncident(payload) {
    try {
      const response = await apiClient.post('/community/report', payload);
      return {
        success: true,
        data: response.data?.data || null,
        message: response.data?.message || 'Incident reported successfully.',
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
   * Fetches nearby community active incidents around specified coordinates.
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radius - in meters (default 5000)
   */
  async getNearbyIncidents(latitude, longitude, radius = 5000) {
    try {
      const response = await apiClient.get('/community/nearby', {
        params: { latitude, longitude, radius },
      });
      return {
        success: true,
        data: response.data?.data || [],
        count: response.data?.count || 0,
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
   * Fetches incidents reported by the logged-in user.
   */
  async getMyReports() {
    try {
      const response = await apiClient.get('/community/my-reports');
      return {
        success: true,
        data: response.data?.data || [],
        count: response.data?.count || 0,
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
   * Confirms/upvotes a reported incident.
   * @param {string} incidentId
   */
  async confirmIncident(incidentId) {
    try {
      const response = await apiClient.post(`/community/${incidentId}/confirm`);
      return {
        success: true,
        data: response.data?.data || null,
        message: response.data?.message || 'Incident confirmed successfully.',
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
   * Reports an incident as false (downvote / flag false).
   * @param {string} incidentId
   */
  async reportFalse(incidentId) {
    try {
      const response = await apiClient.post(`/community/${incidentId}/report-false`);
      return {
        success: true,
        data: response.data?.data || null,
        message: response.data?.message || 'Incident flagged as false report.',
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        error: formatApiError(error),
      };
    }
  },
};
