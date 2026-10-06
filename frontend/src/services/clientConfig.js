import { apiClient } from './apiClient';
import { kvCache } from '../storage/kvCache';
import { clientConfigDefaults, clientConfigRefreshMs } from '../offline/offlineConfig';

/**
 * The server's geofence / risk thresholds (GET /api/config/client), cached on the device, so the offline
 * check uses exactly the server's numbers. A phone that has never reached the server uses the built-in
 * defaults, which a backend test keeps equal to the server's defaults.
 */
const KEY = 'config:client';
const clone = (o) => JSON.parse(JSON.stringify(o));

let current = clone(clientConfigDefaults);
let fetchedAt = null;

const merge = (server) => ({
  geofence: { ...clientConfigDefaults.geofence, ...(server.geofence || {}) },
  risk: { ...clientConfigDefaults.risk, ...(server.risk || {}) },
});

/** Synchronous: the best config known right now. */
export const getClientConfig = () => current;
export const clientConfigAge = () => (fetchedAt ? Date.now() - fetchedAt : null);

/** Loads the cached copy (call at startup). */
export async function loadClientConfig() {
  const hit = await kvCache.get(KEY, { allowExpired: true });
  if (hit && hit.value && hit.value.geofence && hit.value.risk) {
    current = merge(hit.value);
    fetchedAt = hit.storedAt;
  }
  return current;
}

/** Fetches a fresh copy when online and older than the refresh interval. Never throws. */
export async function refreshClientConfig({ force = false } = {}) {
  if (!force && fetchedAt && Date.now() - fetchedAt < clientConfigRefreshMs) return current;
  try {
    const res = await apiClient.get('/config/client', { timeout: 8000 });
    if (res.data && res.data.geofence && res.data.risk) {
      current = merge(res.data);
      fetchedAt = Date.now();
      await kvCache.set(KEY, { geofence: res.data.geofence, risk: res.data.risk });
    }
  } catch (e) {
    /* keep what we have */
  }
  return current;
}
