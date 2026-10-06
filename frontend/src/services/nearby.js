import axios from 'axios';
import { apiClient, formatApiError } from './apiClient';
import { kvCache } from '../storage/kvCache';
import { cell8, distanceMeters } from '../utils/geo';
import { nearbyCache as cacheCfg } from '../offline/offlineConfig';
import { nearbyCenters } from '../offline/cacheLogic';

/**
 * Nearby emergency services (backend GET /api/nearby) with an on-device cache.
 *
 * loadNearby() always tries the network first. A successful answer is stored (SQLite kvCache, 7 days) under
 * the user's H3 res-8 cell and as "last". If the request fails, or the server has no data and nothing
 * cached, the cached result for this cell (or the last result if it was taken within 1.5 km) is returned
 * with state "cached", so the UI can say "Offline data, updated X ago". With no cache: state "none".
 *
 * Cached rows are re-measured from the user's current position. openNow is dropped (null) for cached rows:
 * it cannot be recomputed offline and must never be a guess.
 */
export const NEARBY_TYPES = [
  { key: 'hospital', label: 'Hospital', icon: 'medkit', color: '#c62828' },
  { key: 'police', label: 'Police', icon: 'shield', color: '#1565c0' },
  { key: 'pharmacy', label: 'Pharmacy', icon: 'medical', color: '#2e7d32' },
  { key: 'fire_station', label: 'Fire', icon: 'flame', color: '#ef6c00' },
];

const PREFIX = 'nearby:c:';
const RADIUS = 3000;

const keyFor = (lat, lng) => `${PREFIX}${cell8(lat, lng)}`;

const remeasure = (places, lat, lng) =>
  places
    .map((p) => ({ ...p, distance: Math.round(distanceMeters(lat, lng, p.lat, p.lng)), openNow: null }))
    .sort((a, b) => a.distance - b.distance);

async function storeEntry(lat, lng, data) {
  const entry = { payload: data, center: { lat, lng }, savedAt: Date.now() };
  await kvCache.set(keyFor(lat, lng), entry, { ttlMs: cacheCfg.ttlMs });
  await kvCache.enforcePrefixCap(PREFIX, { maxEntries: cacheCfg.maxEntries, maxBytes: cacheCfg.maxBytes });
}

/**
 * Offline read: merges EVERY cached entry whose centre is within lookupRadiusM of the user (de-duplicated by
 * place id), so a walk across several cached cells keeps working. Returns null when nothing is close enough.
 */
async function readCache(lat, lng) {
  const entries = (await kvCache.getByPrefix(PREFIX, { allowExpired: true })).filter(
    (e) => e.value?.center && distanceMeters(lat, lng, e.value.center.lat, e.value.center.lng) <= cacheCfg.lookupRadiusM
  );
  if (!entries.length) return null;
  const byId = new Map();
  let oldest = Infinity;
  for (const e of entries) {
    oldest = Math.min(oldest, e.value.savedAt);
    for (const p of e.value.payload?.data || []) if (!byId.has(p.id)) byId.set(p.id, p);
  }
  const first = entries[0].value;
  return { payload: { ...first.payload, data: [...byId.values()] }, savedAt: oldest, entries: entries.length };
}

/** Numbers for the "Download this area" estimate (no network). */
export function estimateNearbyDownload(lat, lng, radiusM) {
  const centers = nearbyCenters(lat, lng, radiusM, cacheCfg.centerSpacingM);
  return { centers: centers.length, creditsEstimate: centers.length * cacheCfg.creditsPerCenterEstimate };
}

/**
 * Pre-downloads places for a circle (centres on a lattice, one /api/nearby call each). Used for the current
 * and destination regions and the Settings "Download this area" button. Stops on abort; skips centres the
 * server has no data for. Never throws.
 * @returns {Promise<{done:number, total:number, stored:number, failed:number, aborted:boolean}>}
 */
export async function prefetchNearbyArea({ lat, lng, radiusM = RADIUS, onProgress, signal }) {
  const centers = nearbyCenters(lat, lng, radiusM, cacheCfg.centerSpacingM);
  let stored = 0;
  let failed = 0;
  let done = 0;
  for (const c of centers) {
    if (signal?.aborted) return { done, total: centers.length, stored, failed, aborted: true };
    try {
      const res = await apiClient.get('/nearby', { params: { lat: c.lat, lng: c.lng, radius: RADIUS }, signal });
      if (res.data.status !== 'unavailable') {
        await storeEntry(c.lat, c.lng, res.data);
        stored += 1;
      } else failed += 1;
    } catch (error) {
      if (axios.isCancel(error)) return { done, total: centers.length, stored, failed, aborted: true };
      failed += 1;
    }
    done += 1;
    onProgress && onProgress({ done, total: centers.length });
  }
  return { done, total: centers.length, stored, failed, aborted: false };
}

/**
 * @returns {Promise<{state:'live'|'cached'|'none', status?:string, source?:string|null, stale:boolean,
 *                    cachedAt:string|null, places:Array, error?:Object}>}
 * Rejects only when the request was cancelled (AbortController), so callers can ignore it.
 */
export async function loadNearby({ lat, lng, signal }) {
  let networkError = null;

  try {
    const response = await apiClient.get('/nearby', { params: { lat, lng, radius: RADIUS }, signal });
    const data = response.data;
    if (data.status !== 'unavailable') {
      storeEntry(lat, lng, data);
      return {
        state: 'live',
        status: data.status,
        source: data.source,
        stale: Boolean(data.stale),
        cachedAt: data.cachedAt,
        places: data.data,
      };
    }
    // The server answered but has no data for this area: fall through to the device cache.
  } catch (error) {
    if (axios.isCancel(error)) throw error;
    networkError = formatApiError(error);
  }

  const cached = await readCache(lat, lng);
  if (cached) {
    return {
      state: 'cached',
      status: cached.payload.status,
      source: cached.payload.source,
      stale: true,
      cachedAt: cached.payload.cachedAt || new Date(cached.savedAt).toISOString(),
      savedAt: cached.savedAt,
      places: remeasure(cached.payload.data, lat, lng),
      error: networkError || undefined,
    };
  }
  return { state: 'none', status: 'unavailable', stale: true, cachedAt: null, places: [], error: networkError || undefined };
}

export const nearestOfType = (places, type) => places.find((p) => p.type === type) || null;
