import { getDb } from './db';
import { outboxStore } from './outboxStore';

/**
 * What the on-device geofence check records while offline, and its state machine.
 *
 * Readings and events go into the OUTBOX (types 'location_point' with channel 'geofence', and
 * 'geofence_event'); the runner uploads them: readings through POST /geofence/sync (the server replays them with
 * the same shared state machine), events through POST /geofence/events (history only).
 * device_state keeps the on-device state machine.
 */
export const deviceLogStore = {
  async addReading({ ts, lat, lng, accuracy, h3 }) {
    await outboxStore.enqueue({
      type: 'location_point',
      createdAt: ts,
      payload: { channel: 'geofence', latitude: lat, longitude: lng, accuracy: accuracy ?? null, timestamp: new Date(ts).toISOString(), h3Index: h3 ?? null },
    });
  },

  async addEvent({ ts, event, h3, level, score, message, lat, lng }) {
    await outboxStore.enqueue({
      type: 'geofence_event',
      createdAt: ts,
      payload: { event, h3Index: h3 ?? null, riskLevel: level ?? 'UNKNOWN', totalRisk: score ?? null, timestamp: new Date(ts).toISOString(), message: message ?? null, latitude: lat ?? null, longitude: lng ?? null },
    });
  },

  async getState(key) {
    try {
      const db = await getDb();
      const row = await db.getFirstAsync('SELECT value FROM device_state WHERE key = ?', key);
      return row ? JSON.parse(row.value) : null;
    } catch (e) {
      return null;
    }
  },

  async setState(key, value) {
    try {
      const db = await getDb();
      await db.runAsync('INSERT OR REPLACE INTO device_state (key, value) VALUES (?, ?)', key, JSON.stringify(value));
    } catch (e) {
      console.warn('[deviceLog] setState failed:', e.message);
    }
  },
};
