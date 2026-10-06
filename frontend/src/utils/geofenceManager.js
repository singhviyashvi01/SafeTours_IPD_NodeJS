import { geofenceService } from '../services/geofence';
import { cell9 } from './geo';
import { connectivityStore } from '../connectivity/connectivityStore';
import { runDeviceCheck } from './deviceGeofenceRunner';

/**
 * GeofenceManager: feeds GPS readings to the backend geofence check and re-broadcasts the result.
 *
 * Detection (dwell, hysteresis, accuracy cap, cancellable auto-SOS) happens on the SERVER, which also
 * persists its counters. This class only:
 *   - drops readings that are too inaccurate (the limit comes from the server (GEOFENCE_MAX_ACCURACY_M))
 *   - throttles: a reading is sent when the user ENTERS A NEW H3 CELL (res 9, the backend risk grid; at
 *     least 5 s after the last send, so border jitter cannot flood), OR moved more than 100 m, OR 30 s
 *     have passed since the last one: never on every GPS tick
 *   - emits 'result' / 'lowAccuracy' / 'error' events for screens
 * OFFLINE: when the connectivity state is OFFLINE (or a server check fails with a network error) the reading
 * is checked ON THE DEVICE against cached risk cells (utils/deviceGeofenceRunner, same shared state machine).
 * Those results carry source:'device'; they never create a server SOS.
 */

export const MIN_DISTANCE_METERS = 100;
export const MIN_INTERVAL_MS = 30 * 1000;
export const MIN_CELL_CHANGE_INTERVAL_MS = 5 * 1000;

// Haversine formula to compute distance in meters between two lat/lng points
export const calculateDistanceMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

class GeofenceManager {
  constructor() {
    this.maxAccuracy = Infinity; // learned from the server's accuracyMaxMeters after the first check
    this.lastSent = null; // { latitude, longitude, at, cell }
    this.inFlight = false;
    this.lastResult = null;
    this.listeners = { result: [], lowAccuracy: [], error: [] };
  }

  on(event, callback) {
    if (this.listeners[event]) this.listeners[event].push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners[event]) this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
  }

  emit(event, ...args) {
    (this.listeners[event] || []).forEach((cb) => {
      try {
        cb(...args);
      } catch (err) {
        console.error(`[GeofenceManager] Error in ${event} listener:`, err);
      }
    });
  }

  shouldSend(coords, nowMs) {
    if (!this.lastSent) return true;
    if (nowMs - this.lastSent.at >= MIN_INTERVAL_MS) return true;
    if (nowMs - this.lastSent.at >= MIN_CELL_CHANGE_INTERVAL_MS && cell9(coords.latitude, coords.longitude) !== this.lastSent.cell) {
      return true;
    }
    return (
      calculateDistanceMeters(this.lastSent.latitude, this.lastSent.longitude, coords.latitude, coords.longitude) >=
      MIN_DISTANCE_METERS
    );
  }

  async submitOnDevice(location) {
    const data = await runDeviceCheck(location);
    if (Number.isFinite(data.accuracyMaxMeters)) this.maxAccuracy = data.accuracyMaxMeters;
    this.lastResult = data;
    this.emit('result', data);
    return { status: data.status, data };
  }

  /**
   * @param {{coords:{latitude,longitude,accuracy}, timestamp:number}} location  an expo-location reading
   * @returns {Promise<{status:string, data?:Object}>}
   */
  async submit(location) {
    const c = location?.coords;
    if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return { status: 'INVALID' };

    if (Number.isFinite(c.accuracy) && c.accuracy > this.maxAccuracy) {
      this.emit('lowAccuracy', { accuracy: c.accuracy, max: this.maxAccuracy });
      return { status: 'LOW_ACCURACY' };
    }

    const now = Date.now();
    if (!this.shouldSend(c, now)) return { status: 'THROTTLED' };
    if (this.inFlight) return { status: 'BUSY' };

    this.inFlight = true;
    this.lastSent = { latitude: c.latitude, longitude: c.longitude, at: now, cell: cell9(c.latitude, c.longitude) };
    try {
      if (connectivityStore.getState().isOffline) return await this.submitOnDevice(location);
      const res = await geofenceService.check({
        latitude: c.latitude,
        longitude: c.longitude,
        accuracy: c.accuracy ?? undefined,
        timestamp: new Date(location.timestamp || now).toISOString(),
      });
      if (!res.success && res.error?.status === 0) return await this.submitOnDevice(location); // server unreachable
      if (!res.success) {
        this.emit('error', res.error);
        return { status: 'ERROR', error: res.error };
      }
      if (Number.isFinite(res.data?.accuracyMaxMeters)) this.maxAccuracy = res.data.accuracyMaxMeters;
      this.lastResult = res.data;
      this.emit('result', res.data);
      return { status: res.data?.status || 'OK', data: res.data };
    } finally {
      this.inFlight = false;
    }
  }
}

export const geofenceManager = new GeofenceManager();
