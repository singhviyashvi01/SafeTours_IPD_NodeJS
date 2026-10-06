const test = require('node:test');
const assert = require('node:assert/strict');
const geofenceService = require('./geofence.service');

const NOW = new Date('2026-10-06T12:00:00Z');
const ev = (o = {}) => ({ event: 'ENTER', timestamp: '2026-10-06T11:00:00Z', h3Index: '8960145b5b3ffff', riskLevel: 'HIGH', totalRisk: 72, latitude: 19.07, longitude: 72.87, ...o });

// updateOne with upsert + $setOnInsert, unique on (userId, idempotencyKey): same behaviour as the real collection.
function fakeEvents() {
  const docs = new Map();
  return {
    docs,
    async updateOne(filter, update) {
      const k = `${filter.userId}|${filter.idempotencyKey}`;
      if (docs.has(k)) return { upsertedCount: 0 };
      docs.set(k, update.$setOnInsert);
      return { upsertedCount: 1 };
    },
  };
}

test('device events are stored as history; the same event twice is stored once', async () => {
  const model = fakeEvents();
  const a = await geofenceService.recordDeviceEvents('u1', [ev(), ev({ event: 'EXIT', timestamp: '2026-10-06T11:20:00Z' })], { model, now: NOW });
  const b = await geofenceService.recordDeviceEvents('u1', [ev(), ev({ event: 'EXIT', timestamp: '2026-10-06T11:20:00Z' })], { model, now: NOW });
  assert.deepEqual([a.inserted, a.duplicates], [2, 0]);
  assert.deepEqual([b.inserted, b.duplicates], [0, 2]);
  assert.equal(model.docs.size, 2);
  const stored = [...model.docs.values()][0];
  assert.equal(stored.historical, true); // never a live prompt, whatever the age
  assert.equal(stored.source, 'device');
});

test('an event uses the SAME key as the server derives from replayed points, so history has one entry either way', async () => {
  const model = fakeEvents();
  const e = ev();
  // what persistEvents() writes for a replayed point: `${event}:${timestampMs}:${h3Index}`
  const derivedKey = `${e.event}:${new Date(e.timestamp).getTime()}:${e.h3Index}`;
  model.docs.set(`u1|${derivedKey}`, { source: 'server' });
  const out = await geofenceService.recordDeviceEvents('u1', [e], { model, now: NOW });
  assert.equal(out.inserted, 0);
  assert.equal(out.duplicates, 1);
  assert.equal(model.docs.size, 1);
});

test('events are per user, and impossible times are rejected individually', async () => {
  const model = fakeEvents();
  await geofenceService.recordDeviceEvents('u1', [ev()], { model, now: NOW });
  const other = await geofenceService.recordDeviceEvents('u2', [ev(), ev({ timestamp: '2026-10-06T13:00:00Z' }), ev({ timestamp: 'nope' }), ev({ timestamp: '2026-08-01T00:00:00Z' })], { model, now: NOW });
  assert.equal(other.inserted, 1);
  assert.deepEqual(other.rejected.map((r) => r.index), [1, 2, 3]);
});
