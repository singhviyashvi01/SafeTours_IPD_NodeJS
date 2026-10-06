/**
 * locationBus: the single place where the latest device position is published, so several features (risk
 * and geofence checks, nearby services, maps) share one GPS watch instead of each starting their own.
 */
let last = null; // { latitude, longitude, accuracy, timestamp }
const listeners = new Set();

export const locationBus = {
  publish(location) {
    const c = location?.coords;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;
    last = { latitude: c.latitude, longitude: c.longitude, accuracy: c.accuracy ?? null, timestamp: location.timestamp || Date.now() };
    listeners.forEach((fn) => {
      try {
        fn(last);
      } catch (e) {
        console.warn('[locationBus] listener error:', e.message);
      }
    });
  },
  getLast: () => last,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
