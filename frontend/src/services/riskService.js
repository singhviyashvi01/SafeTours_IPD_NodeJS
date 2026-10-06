import { apiClient, formatApiError } from './apiClient';
import { cachedRiskAt, cachedCellsInBox } from './riskCache';

/**
 * Risk API (backend /api/risk). Every call resolves to { success, data, error? } and never throws.
 *
 * A risk result has riskLevel SAFE | LOW | MODERATE | HIGH | EXTREME, or UNKNOWN when the backend
 * does not have enough data to say. totalRiskScore is null when the level is UNKNOWN: never show
 * UNKNOWN as "safe", and never render a null score as 0.
 */
// True when the server could not be reached (forced offline, no network, timeout), as opposed to an answer.
const unreachable = (error) => error?.code === 'FORCED_OFFLINE' || !error?.response;

/**
 * `offline()` is the cache fallback: it returns a result tagged source:'device' (computed on the phone from
 * cached cells) or null when nothing is cached, in which case the original error is returned.
 */
const run = async (request, shape, offline) => {
  try {
    const response = await request();
    return { success: true, ...shape(response.data) };
  } catch (error) {
    if (offline && unreachable(error)) {
      try {
        const cached = await offline();
        if (cached) return { success: true, ...cached };
      } catch (e) {
        /* fall through to the network error */
      }
    }
    return { success: false, data: null, error: formatApiError(error) };
  }
};

// Bounding box (degrees) around a point for a radius in metres.
export const boundingBox = (lat, lng, radiusMeters) => {
  const dLat = radiusMeters / 111320;
  const dLng = radiusMeters / (111320 * Math.max(0.1, Math.cos((lat * Math.PI) / 180)));
  return { minLat: lat - dLat, maxLat: lat + dLat, minLng: lng - dLng, maxLng: lng + dLng };
};

export const riskService = {
  /** Risk of the H3 cell containing the point. */
  getLocationRisk: (lat, lng) =>
    run(
      () => apiClient.get('/risk/location', { params: { lat, lng } }),
      (d) => ({ data: d?.data || null }),
      async () => {
        const v = await cachedRiskAt(Number(lat), Number(lng));
        return v ? { data: v, source: 'device', fetchedAt: v.fetchedAt } : null;
      }
    ),

  /** Cheap poll while moving: the full payload only comes back when the cell changed. */
  getLiveRisk: (lat, lng, previousH3Index) =>
    run(
      () => apiClient.get('/risk/live', { params: { lat, lng, ...(previousH3Index ? { previousH3Index } : {}) } }),
      (d) => ({ data: d?.data || null }),
      async () => {
        const v = await cachedRiskAt(Number(lat), Number(lng));
        return v ? { data: v, source: 'device', fetchedAt: v.fetchedAt } : null;
      }
    ),

  /** Risk cells (hexagons) inside a bounding box with level >= minLevel. */
  getCells: ({ minLat, maxLat, minLng, maxLng, minLevel = 'LOW', includeUnknown = false }) =>
    run(
      () => apiClient.get('/risk/cells', { params: { minLat, maxLat, minLng, maxLng, minLevel, includeUnknown } }),
      (d) => ({ data: d?.data || [], count: d?.count || 0, meta: d?.meta || {} }),
      async () => {
        const { cells, oldestFetchedAt } = await cachedCellsInBox({ minLat, maxLat, minLng, maxLng }, minLevel);
        // An empty cache is "no data", not "no risk": report failure so the screen shows the offline message.
        if (oldestFetchedAt === null) return null;
        return { data: cells, count: cells.length, meta: { source: 'device', fetchedAt: oldestFetchedAt } };
      }
    ),

  /** Risk cells within radiusMeters of a point. */
  getCellsAround(lat, lng, radiusMeters = 3000, minLevel = 'LOW') {
    return this.getCells({ ...boundingBox(Number(lat), Number(lng), radiusMeters), minLevel });
  },

  /** One cell by H3 index. */
  getCell: (h3Index) =>
    run(() => apiClient.get(`/risk/cell/${h3Index}`), (d) => ({ data: d?.data || null })),
};
