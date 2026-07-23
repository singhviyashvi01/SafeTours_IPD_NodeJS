import { apiClient, formatApiError } from './apiClient';

/**
 * Journey API integration. The existing Axios client automatically attaches
 * the JWT, so each call remains within the authenticated frontend flow.
 */
const unwrapJourney = response => response.data?.journey ?? null;

// The existing Journey History screen still depends on this temporary data.
// No backend history endpoint exists, so this method is intentionally unchanged
// and is outside the active-journey API integration in this phase.
const historyFallback = [{ id: 'journey-1', destination: 'Victoria Station', eta: '18:45', status: 'completed', startedAt: '2026-07-17T18:20:00Z', lastLocation: { latitude: 51.503, longitude: -0.119, address: 'Victoria, London' }, timeline: [{ title: 'Journey started', time: '18:20' }, { title: 'Safe arrival', time: '18:45' }] }];

export const journeyService = {
  list: async () => [...historyFallback],

  /** POST /journey/start creates the user's active journey. */
  start: async payload => {
    try {
      const response = await apiClient.post('/journey/start', payload);
      return unwrapJourney(response);
    } catch (error) {
      throw formatApiError(error);
    }
  },

  /** POST /journey/update/:id updates ETA or journey metadata while active. */
  update: async (journeyId, payload) => {
    try {
      const response = await apiClient.post(`/journey/update/${journeyId}`, payload);
      return unwrapJourney(response);
    } catch (error) {
      throw formatApiError(error);
    }
  },

  /** POST /journey/end/:id completes or cancels the active journey. */
  end: async (journeyId, status) => {
    try {
      const response = await apiClient.post(`/journey/end/${journeyId}`, { status });
      return unwrapJourney(response);
    } catch (error) {
      throw formatApiError(error);
    }
  },

  /** GET /journey/status restores the backend-persisted active journey. */
  getActive: async () => {
    try {
      const response = await apiClient.get('/journey/status');
      return unwrapJourney(response);
    } catch (error) {
      throw formatApiError(error);
    }
  },
};
