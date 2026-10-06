import { latLngToCell } from 'h3-js';

/**
 * H3 helpers (h3-js 4.5, the browser build Metro picks for React Native; it has no WebAssembly/BigInt/Node
 * dependencies and compiles with Hermes' compiler. Confirm it on a device: see the Phase 5 notes).
 *   cell8: nearby-services cache cell (matches the backend)
 *   cell9: risk-grid cell (matches the backend geofence / risk cells)
 */
export const cell8 = (lat, lng) => latLngToCell(lat, lng, 8);
export const cell9 = (lat, lng) => latLngToCell(lat, lng, 9);

export const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const formatDistance = (m) => {
  if (!Number.isFinite(m)) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m / 10) * 10 || 10} m`;
};

export const formatAge = (ms) => {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 60000) return 'just now';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
};
