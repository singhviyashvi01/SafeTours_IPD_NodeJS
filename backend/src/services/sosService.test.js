const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ── minimal in-memory stand-ins for the Mongoose models sosService touches ─────────────────────────
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const setPath = (o, p, v) => {
  const ks = p.split('.');
  let cur = o;
  ks.slice(0, -1).forEach((k) => { cur[k] = cur[k] || {}; cur = cur[k]; });
  cur[ks[ks.length - 1]] = v;
};
const cmp = (a, b) => (a instanceof Date || b instanceof Date ? new Date(a).getTime() - new Date(b).getTime() : a - b);
function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = getPath(doc, k);
    if (cond && typeof cond === 'object' && !(cond instanceof Date) && !Array.isArray(cond)) {
      return Object.entries(cond).every(([op, x]) => {
        if (op === '$in') return x.map(String).includes(String(v));
        if (op === '$lte') return v != null && cmp(v, x) <= 0;
        throw new Error(`unsupported operator ${op}`);
      });
    }
    return String(v) === String(cond);
  });
}
function fakeModel() {
  let seq = 0;
  const docs = [];
  const wrap = (d) => d && Object.assign(d, { toObject: () => JSON.parse(JSON.stringify(d, (k, v) => v)) && { ...d } });
  const chain = (rows) => {
    const c = {
      sort: () => c,
      limit: (n) => { rows = rows.slice(0, n); return c; },
      select: () => c,
      lean: async () => rows,
      exec: async () => rows,
      then: (res, rej) => Promise.resolve(rows).then(res, rej),
    };
    return c;
  };
  const apply = (d, update) => {
    for (const [k, v] of Object.entries(update.$set || {})) setPath(d, k, v);
  };
  return {
    docs,
    async create(data) {
      if (data.idempotencyKey && docs.some((d) => String(d.user) === String(data.user) && d.idempotencyKey === data.idempotencyKey)) {
        const e = new Error('E11000 duplicate key');
        e.code = 11000;
        throw e;
      }
      const d = { _id: `id${(seq += 1)}`, createdAt: new Date(), ...data };
      docs.push(d);
      return wrap(d);
    },
    findOne: (f) => { const rows = docs.filter((d) => matches(d, f)).map(wrap); const c = chain(rows); c.then = (res, rej) => Promise.resolve(rows[0] || null).then(res, rej); return c; },
    findById: async (id) => wrap(docs.find((d) => d._id === id) || null),
    find: (f) => chain(docs.filter((d) => matches(d, f)).map(wrap)),
    async findOneAndUpdate(f, update) {
      const d = docs.find((x) => matches(x, f));
      if (!d) return null;
      apply(d, update);
      return wrap(d);
    },
    async updateOne(f, update) { const d = docs.find((x) => matches(x, f)); if (d) apply(d, update); return { modifiedCount: d ? 1 : 0 }; },
    async updateMany(f, update) { const rows = docs.filter((x) => matches(x, f)); rows.forEach((d) => apply(d, update)); return { modifiedCount: rows.length }; },
    async countDocuments(f) { return docs.filter((d) => matches(d, f)).length; },
  };
}

const stub = (rel, exports) => {
  const resolved = require.resolve(path.join(__dirname, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

const SOS = fakeModel();
const calls = { stateUpdates: [], journeyUpdates: [], sms: [], notify: [] };
const Location = fakeModel();
const Contacts = fakeModel();
stub('../models/SOSHistory', SOS);
stub('../models/Location', Location);
stub('../models/Journey', { findOne: () => ({ select: () => ({ lean: async () => null }) }), updateOne: async (...a) => { calls.journeyUpdates.push(a); } });
stub('../models/EmergencyContact', Contacts);
stub('../models/UserGeofenceState', { updateOne: async (...a) => { calls.stateUpdates.push(a); } });
stub('./notificationService', { notify: async (a) => { calls.notify.push(a); return {}; } });
stub('./smsService', { sendSOSToSMSContacts: async (a) => { calls.sms.push(a); return { sent: 1, failed: 0, provider: 'test' }; } });

const sosService = require('./sosService');

const USER = 'user1';
const NOW = new Date('2026-10-03T12:00:00Z');
const at = (sec) => new Date(NOW.getTime() + sec * 1000);
const coords = { latitude: 19.07, longitude: 72.87, accuracy: 10, timestamp: NOW, approximate: false };
const reset = () => { SOS.docs.length = 0; Contacts.docs.length = 0; Location.docs.length = 0; Object.values(calls).forEach((a) => (a.length = 0)); };
const addContact = async () => Contacts.create({ user: USER, phone: '+911234567890' });
const geoCheck = (extra = {}) => sosService.createSafetyCheck(USER, { trigger: 'GEOFENCE', coords, h3Index: 'cell1', riskLevel: 'HIGH', reason: 'x', ...extra }, NOW);

test('a safety check is pending with a persisted 60 s deadline and does NOT notify contacts yet', async () => {
  reset();
  const rec = await geoCheck();
  assert.equal(rec.status, 'pending_confirmation');
  assert.equal(new Date(rec.confirmBy).getTime(), at(60).getTime());
  assert.equal(rec.secondsLeft, 60);
  assert.equal(calls.sms.length, 0);
  assert.equal(calls.notify[0].type, 'SAFETY_CHECK');
});

test('duplicate suppression: only one pending-or-active record per user', async () => {
  reset();
  assert.ok(await geoCheck());
  assert.equal(await geoCheck(), null); // second prompt suppressed
  const manual = await sosService.createManual(USER, { location: coords }, NOW).catch((e) => e);
  assert.ok(!(manual instanceof Error) || manual.statusCode === 400); // see next test: it escalates, not duplicates
  assert.equal(SOS.docs.filter((d) => ['pending_confirmation', 'active'].includes(d.status)).length, 1);
});

test('idempotency: the same key returns the original record and never creates another', async () => {
  reset();
  await addContact();
  const a = await sosService.createManual(USER, { location: coords, idempotencyKey: 'offline-retry-0001' }, NOW);
  const b = await sosService.createManual(USER, { location: coords, idempotencyKey: 'offline-retry-0001' }, NOW);
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(b.record.id, a.record.id);
  assert.equal(SOS.docs.length, 1);

  reset();
  const k1 = await geoCheck({ idempotencyKey: 'geofence:u:c:1' });
  SOS.docs[0].status = 'cancelled';
  const k2 = await geoCheck({ idempotencyKey: 'geofence:u:c:1' });
  assert.equal(k2.id, k1.id); // same key, even after the first was closed
  assert.equal(SOS.docs.length, 1);
});

test('cancel window: nothing escalates before the deadline, the check escalates exactly once after it', async () => {
  reset();
  await addContact();
  await geoCheck();
  assert.deepEqual(await sosService.processDue(at(30)), { escalated: 0, autoResolved: 0 });
  assert.equal(SOS.docs[0].status, 'pending_confirmation');

  assert.equal((await sosService.processDue(at(61))).escalated, 1);
  assert.equal(SOS.docs[0].status, 'active');
  assert.equal(SOS.docs[0].escalatedBy, 'timeout');
  await new Promise((r) => setImmediate(r)); // let the fire-and-forget dispatch run
  assert.equal(calls.sms.length, 1);
  assert.equal(calls.sms[0].coords.latitude, 19.07); // the stored location, not a default

  assert.equal((await sosService.processDue(at(120))).escalated, 0); // idempotent
});

test('"I\'m safe" before the deadline cancels it; the timer then does nothing and contacts are never alerted', async () => {
  reset();
  await addContact();
  const rec = await geoCheck();
  const out = await sosService.cancel(USER, rec.id, {}, at(20));
  assert.equal(out.record.status, 'cancelled');
  assert.equal((await sosService.processDue(at(90))).escalated, 0);
  assert.equal(calls.sms.length, 0);
  // cancelling again is harmless
  assert.equal((await sosService.cancel(USER, rec.id, {}, at(95))).alreadyClosed, true);
});

test('cancelling a GEOFENCE check starts the cooldown around its cell', async () => {
  reset();
  const rec = await geoCheck();
  await sosService.cancel(USER, rec.id, {}, at(10));
  const [filter, update] = calls.stateUpdates[0];
  assert.deepEqual(filter, { userId: USER });
  assert.equal(update.$set.cooldownCell, 'cell1');
  assert.equal(update.$set.cooldownUntil.getTime(), at(10).getTime() + 30 * 60000);
});

test('"I\'m okay" on a Shadow Mode ETA check extends the journey ETA (default 15 min, or the client value)', async () => {
  reset();
  const rec = await sosService.createSafetyCheck(USER, { trigger: 'SHADOW_MODE', coords, journeyId: 'j1', reason: 'eta' }, NOW);
  await sosService.cancel(USER, rec.id, { extendMinutes: 30 }, at(5));
  const [, update] = calls.journeyUpdates[0];
  assert.equal(update.$set.expectedArrivalTime.getTime(), at(5).getTime() + 30 * 60000);

  reset();
  const rec2 = await sosService.createSafetyCheck(USER, { trigger: 'SHADOW_MODE', coords, journeyId: 'j1', reason: 'eta' }, NOW);
  await sosService.cancel(USER, rec2.id, {}, at(5));
  assert.equal(calls.journeyUpdates[0][1].$set.expectedArrivalTime.getTime(), at(5).getTime() + 15 * 60000);
});

test('"Send SOS now" escalates immediately and is idempotent', async () => {
  reset();
  await addContact();
  const rec = await geoCheck();
  const a = await sosService.confirm(USER, rec.id, at(3));
  assert.equal(a.record.status, 'active');
  assert.equal(SOS.docs[0].escalatedBy, 'user');
  const b = await sosService.confirm(USER, rec.id, at(4));
  assert.equal(b.duplicate, true);
});

test('manual SOS while a check is pending escalates that check instead of creating a second record', async () => {
  reset();
  await addContact();
  await geoCheck();
  const out = await sosService.createManual(USER, { location: coords }, at(5));
  assert.equal(out.escalatedPending, true);
  assert.equal(SOS.docs.length, 1);
  assert.equal(SOS.docs[0].status, 'active');
});

test('manual SOS while one is already active returns it (no duplicate, no error)', async () => {
  reset();
  await addContact();
  const first = await sosService.createManual(USER, { location: coords }, NOW);
  const second = await sosService.createManual(USER, { location: coords }, at(10));
  assert.equal(second.alreadyActive, true);
  assert.equal(second.record.id, first.record.id);
  assert.equal(SOS.docs.length, 1);
});

test('SOS works without /location having been called: the location is stored inside the record', async () => {
  reset();
  await addContact();
  const out = await sosService.createManual(USER, { location: { latitude: 19.1, longitude: 72.9, accuracy: 12 } }, NOW);
  assert.equal(out.record.coords.latitude, 19.1);
  assert.equal(out.record.coords.longitude, 72.9);
  assert.equal(SOS.docs[0].location ?? null, null);
  assert.equal(Location.docs.length, 0);
});

test('no location in the request and none stored: 400, never an invented position', async () => {
  reset();
  await addContact();
  await assert.rejects(() => sosService.createManual(USER, {}, NOW), (e) => e.statusCode === 400);
});

test('active SOS older than 12 h is auto-closed so it cannot block new SOS forever', async () => {
  reset();
  await addContact();
  await sosService.createManual(USER, { location: coords }, NOW);
  const later = new Date(NOW.getTime() + 13 * 3600000);
  assert.equal((await sosService.processDue(later)).autoResolved, 1);
  assert.equal(SOS.docs[0].status, 'resolved');
});
