import { apiClient, formatApiError } from './apiClient';

/**
 * Geofence API (backend /api/geofence). The backend owns detection: dwell (3 readings / 60 s),
 * hysteresis, accuracy filtering and the cancellable "Are you safe?" flow. The app only sends readings.
 */
const run = async (request) => {
  try {
    const response = await request();
    return { success: true, data: response.data };
  } catch (error) {
    return { success: false, data: null, error: formatApiError(error) };
  }
};

export const geofenceService = {
  /** One live GPS reading. */
  check: ({ latitude, longitude, accuracy, timestamp }) =>
    run(() => apiClient.post('/geofence/check', { latitude, longitude, accuracy, timestamp })),

  /** Offline batch (used by the offline phase). */
  sync: (locations) => run(() => apiClient.post('/geofence/sync', { locations })),

  status: () => run(() => apiClient.get('/geofence/status')),

  history: () => run(() => apiClient.get('/geofence/history')),
};
