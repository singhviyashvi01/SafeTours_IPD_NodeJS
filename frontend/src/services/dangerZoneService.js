import { apiClient, formatApiError } from './apiClient';

/**
 * Service for interacting with backend Danger Zone endpoints.
 */
export const dangerZoneService = {
  /**
   * Fetch danger zones, optionally filtered by bounding box (minLat, maxLat, minLng, maxLng)
   */
  async getDangerZones(params = {}) {
    try {
      const response = await apiClient.get('/danger-zones', { params });
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
   * Fetch nearby danger zones around specified lat, lng, radius (in meters)
   */
  async getNearbyDangerZones(lat, lng, radius = 2000) {
    try {
      const response = await apiClient.get('/danger-zones/nearby', {
        params: { lat, lng, radius },
      });
      return {
        success: true,
        data: response.data?.data || (response.data?.data?.zone ? [response.data.data.zone] : []),
        count: response.data?.count || (response.data?.data ? 1 : 0),
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
   * Fetch details for a specific H3 cell or Danger Zone index
   */
  async getDangerZoneByH3Index(h3Index) {
    try {
      const response = await apiClient.get(`/danger-zones/${h3Index}`);
      return {
        success: true,
        data: response.data?.data || null,
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
   * Fetch crime score summary for a set of coordinates
   */
  async getCrimeScore(lat, lng) {
    try {
      const response = await apiClient.get('/danger-zones/crime-score', {
        params: { lat, lng },
      });
      return {
        success: true,
        data: response.data?.data || null,
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
