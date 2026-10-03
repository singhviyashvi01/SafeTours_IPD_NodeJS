import { apiClient, formatApiError } from './apiClient';

/**
 * SOS API (backend /api/sos).
 *
 * Contract
 *   POST /sos                 create a manual SOS. Body: { location:{latitude,longitude,accuracy?,timestamp?}, journeyId?, reason? }
 *                             The location travels in the body; /location does not need to be called first.
 *                             Send an Idempotency-Key (newKey()) and REUSE it when retrying.
 *   GET  /sos/pending         the "Are you safe?" check waiting for an answer, or null
 *   POST /sos/:id/confirm     "Send SOS now" for a pending check
 *   POST /sos/:id/cancel      "I'm safe" for a pending check / cancel an active SOS ({ reason?, extendMinutes? })
 *   GET  /sos/history, GET /sos/active
 */
const run = async (request, pick) => {
  try {
    const response = await request();
    return { success: true, data: pick(response.data), message: response.data?.message || '', duplicate: Boolean(response.data?.duplicate) };
  } catch (error) {
    return { success: false, data: null, error: formatApiError(error) };
  }
};

export const sosService = {
  /** A new idempotency key; generate once per user action and reuse on retries. */
  newKey: () => `sos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,

  create: ({ location, journeyId, reason, idempotencyKey }) =>
    run(
      () =>
        apiClient.post(
          '/sos',
          { location, ...(journeyId ? { journeyId } : {}), ...(reason ? { reason } : {}) },
          { headers: { 'Idempotency-Key': idempotencyKey || sosService.newKey() } }
        ),
      (d) => d?.data ?? null
    ),

  getPending: () => run(() => apiClient.get('/sos/pending'), (d) => d?.data ?? null),

  getActive: () => run(() => apiClient.get('/sos/active'), (d) => d?.data ?? null),

  confirm: (id) => run(() => apiClient.post(`/sos/${id}/confirm`), (d) => d?.data ?? null),

  cancel: (id, { reason, extendMinutes } = {}) =>
    run(() => apiClient.post(`/sos/${id}/cancel`, { ...(reason ? { reason } : {}), ...(extendMinutes ? { extendMinutes } : {}) }), (d) => d?.data ?? null),

  async getHistory() {
    const res = await run(() => apiClient.get('/sos/history'), (d) => (Array.isArray(d?.data) ? d.data : []));
    return res.success ? res : { ...res, data: [] };
  },

  async list() {
    const res = await this.getHistory();
    return res.data || [];
  },
};
