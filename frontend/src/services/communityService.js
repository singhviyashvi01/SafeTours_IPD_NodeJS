import { apiClient, formatApiError } from './apiClient';
import { sendOrQueue } from './outbox';
import { kvCache } from '../storage/kvCache';

// Last-resort list for a phone that has never reached the server. The server's list (GET /api/community/categories, from config/communityConfig.js) replaces it as soon as it is fetched.
const FALLBACK_CATEGORIES = ['Harassment', 'Theft', 'Assault', 'Suspicious Activity', 'Accident', 'Medical Emergency', 'Fire', 'Road Block', 'Waterlogging', 'Street Light Failure', 'Other'];
const CATEGORIES_KEY = 'community:categories';

/**
 * Service for interacting with backend Community Incident endpoints.
 */
export const communityService = {
  /**
   * The report categories: the server's single list, cached on the phone, with a built-in last resort.
   * @returns {Promise<string[]>}
   */
  async getCategories() {
    try {
      const response = await apiClient.get('/community/categories', { timeout: 6000 });
      const names = (response.data?.data || []).map((c) => c.name).filter(Boolean);
      if (names.length) {
        await kvCache.set(CATEGORIES_KEY, names);
        return names;
      }
    } catch (error) {
      /* offline: use the cache */
    }
    const hit = await kvCache.get(CATEGORIES_KEY, { allowExpired: true });
    return hit && Array.isArray(hit.value) && hit.value.length ? hit.value : FALLBACK_CATEGORIES;
  },

  /**
   * Reports a new community incident.
   * @param {Object} payload - { incidentType, description, latitude, longitude }
   */
  async reportIncident(payload) {
    // Sent now, or kept in the outbox (same idempotency key) and sent when the connection returns. A report that
    // reached the server but whose answer was lost is not created twice: the server stores the key.
    const res = await sendOrQueue({
      type: 'community_report',
      payload: { report: payload },
      send: (key) => apiClient.post('/community/report', payload, { headers: { 'Idempotency-Key': key } }),
    });
    if (res.success) {
      return {
        success: true,
        data: res.response.data?.data || null,
        message: res.response.data?.message || 'Incident reported successfully.',
      };
    }
    if (res.queued) {
      return { success: true, queued: true, data: null, message: 'Saved offline. It will be reported automatically when you are back online.' };
    }
    return { success: false, data: null, error: res.error };
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
