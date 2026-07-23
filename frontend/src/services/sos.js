import { apiClient, formatApiError } from './apiClient';

const unwrapData = response => response.data?.data;

// Converts Axios' timeout wording into an actionable message for SOS screens.
const toSOSApiError = error => {
  const formatted = formatApiError(error);
  if (error?.code === 'ECONNABORTED' || /timeout/i.test(formatted.message)) {
    return { ...formatted, message: 'SOS request timed out. Check your connection and try again.' };
  }
  return formatted;
};

export const sosService = {
  /** GET /sos/history returns the user's newest SOS records, including active ones. */
  history: async () => {
    try { return unwrapData(await apiClient.get('/sos/history')) || []; }
    catch (error) { throw toSOSApiError(error); }
  },

  /** POST /sos/manual sends { locationId, journeyId?, reason? } and creates an active SOS. */
  triggerManual: async payload => {
    try { return unwrapData(await apiClient.post('/sos/manual', payload)); }
    catch (error) { throw toSOSApiError(error); }
  },

  /** POST /sos/automatic sends the active journey and location chosen by the caller. No geofence logic is included. */
  triggerAutomatic: async payload => {
    try { return unwrapData(await apiClient.post('/sos/automatic', payload)); }
    catch (error) { throw toSOSApiError(error); }
  },

  /** POST /sos/cancel closes an active SOS record with an optional user-provided reason. */
  cancel: async (sosId, reason) => {
    try { return unwrapData(await apiClient.post('/sos/cancel', { sosId, reason })); }
    catch (error) { throw toSOSApiError(error); }
  },
};
