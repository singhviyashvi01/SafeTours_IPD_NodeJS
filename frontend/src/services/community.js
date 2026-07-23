import { apiClient, formatApiError } from './apiClient';

const unwrapData = response => response.data?.data;
const toCommunityError = error => {
  const formatted = formatApiError(error);
  return error?.code === 'ECONNABORTED' || /timeout/i.test(formatted.message)
    ? { ...formatted, message: 'Community request timed out. Check your connection and retry.' }
    : formatted;
};

export const communityService = {
  /** POST /community/report sends incident type, description, and manual coordinates. */
  report: async payload => { try { return unwrapData(await apiClient.post('/community/report', payload)); } catch (error) { throw toCommunityError(error); } },
  /** GET /community/nearby returns active incidents for a coordinate/radius search, for list rendering only. */
  nearby: async ({ latitude, longitude, radius }) => { try { return unwrapData(await apiClient.get('/community/nearby', { params: { latitude, longitude, radius } })) || []; } catch (error) { throw toCommunityError(error); } },
  /** POST /community/:id/confirm records a confirmation, used by the list's upvote action. */
  confirm: async incidentId => { try { return unwrapData(await apiClient.post(`/community/${incidentId}/confirm`)); } catch (error) { throw toCommunityError(error); } },
  /** POST /community/:id/report-false records a false report, used by the list's downvote action. */
  reportFalse: async incidentId => { try { return unwrapData(await apiClient.post(`/community/${incidentId}/report-false`)); } catch (error) { throw toCommunityError(error); } },
};
