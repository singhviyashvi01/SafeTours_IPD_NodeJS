const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ── stubs for the models journeyService touches ─────────────────────────────────────────────────
const stub = (rel, exports) => {
  const resolved = require.resolve(path.join(__dirname, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};

const state = { saved: 0, completed: 0, doc: null };
const makeJourney = () => ({
  _id: 'j1',
  destination: { coordinates: [72.8777, 19.076] }, // lng, lat
  lastKnownLocation: null,
  async save() { state.saved += 1; },
});
stub('../models/Journey', {
  findOne: async () => state.doc,
  findOneAndUpdate: async () => { state.completed += 1; return { _id: 'j1', status: 'COMPLETED' }; },
});
let savedLocation = null;
class FakeLocation {
  constructor(d) { this.d = d; }
  async save() { savedLocation = this.d; return this.d; }
}
stub('../models/Location', FakeLocation);
stub('./sosService', { cancelPendingForJourney: async () => 0 });
stub('./notificationService', { notify: async () => ({}) });

const journeyService = require('./journeyService');
const locationService = require('./locationService');
const { chatRules } = require('../validators/assistantValidator');

const AT_DESTINATION = { latitude: 19.076, longitude: 72.8777 };

test('arrival: a position at the destination with KNOWN good accuracy completes the journey', async () => {
  state.doc = makeJourney();
  state.completed = 0;
  const r = await journeyService.checkArrival('u1', { ...AT_DESTINATION, accuracy: 12 });
  assert.equal(r.arrived, true);
  assert.equal(state.completed, 1);
});

test('arrival: unknown accuracy (null or missing) is NOT trusted: no arrival, the position is still remembered', async () => {
  for (const accuracy of [null, undefined]) {
    state.doc = makeJourney();
    state.completed = 0;
    state.saved = 0;
    const r = await journeyService.checkArrival('u1', { ...AT_DESTINATION, accuracy });
    assert.equal(r.arrived, false);
    assert.equal(state.completed, 0);
    assert.equal(state.saved, 1); // last known location was stored
    assert.deepEqual(state.doc.lastKnownLocation.coordinates, [AT_DESTINATION.longitude, AT_DESTINATION.latitude]);
  }
});

test('arrival: poor accuracy is still not trusted', async () => {
  state.doc = makeJourney();
  const r = await journeyService.checkArrival('u1', { ...AT_DESTINATION, accuracy: 400 });
  assert.equal(r.arrived, false);
});

// ── storage: null stays null ────────────────────────────────────────────────────────────────────
test('batch storage: missing / null accuracy is stored as null, never as 0 or a default', async () => {
  const docs = [];
  const model = {
    find: () => ({ select: () => ({ lean: async () => [] }) }),
    insertMany: async (list) => { docs.push(...list); },
  };
  const NOW = new Date('2026-10-12T10:00:00Z');
  const pt = (n, extra) => ({ idempotencyKey: `acc-key-000${n}`, latitude: 19.07, longitude: 72.87, timestamp: new Date(NOW.getTime() - n * 1000).toISOString(), ...extra });
  await locationService.saveBatch('u1', [pt(1, { accuracy: null }), pt(2, {}), pt(3, { accuracy: 8.5 }), pt(4, { accuracy: 0 })], { model, now: NOW });
  const byKey = Object.fromEntries(docs.map((d) => [d.idempotencyKey, d.accuracy]));
  assert.equal(byKey['acc-key-0001'], null);
  assert.equal(byKey['acc-key-0002'], null);
  assert.equal(byKey['acc-key-0003'], 8.5);
  assert.equal(byKey['acc-key-0004'], 0); // a real 0 m reading is kept as reported
});

test('single point storage: a null accuracy is saved as null', async () => {
  await locationService.saveLocation('507f1f77bcf86cd799439011', { latitude: 19.07, longitude: 72.87, accuracy: null, timestamp: new Date() });
  assert.equal(savedLocation.accuracy, null);
  await locationService.saveLocation('507f1f77bcf86cd799439011', { latitude: 19.07, longitude: 72.87, timestamp: new Date() });
  assert.equal(savedLocation.accuracy, null);
  await locationService.saveLocation('507f1f77bcf86cd799439011', { latitude: 19.07, longitude: 72.87, accuracy: 9, timestamp: new Date() });
  assert.equal(savedLocation.accuracy, 9);
});

// ── validators accept an unknown accuracy ───────────────────────────────────────────────────────
const { validationResult } = require('express-validator');
async function runRules(rules, body) {
  const req = { body };
  for (const rule of rules) await rule.run(req);
  return validationResult(req).array();
}

test('validators: accuracy may be null or missing on the single and the batch endpoint, but not negative or text', async () => {
  const { validateLocationRules, validateLocationBatchRules } = require('../middleware/locationValidator');
  const base = { latitude: 19.07, longitude: 72.87, timestamp: new Date().toISOString() };
  assert.equal((await runRules(validateLocationRules, { ...base, accuracy: null })).length, 0);
  assert.equal((await runRules(validateLocationRules, { ...base })).length, 0);
  assert.ok((await runRules(validateLocationRules, { ...base, accuracy: -5 })).length > 0);
  assert.ok((await runRules(validateLocationRules, { ...base, accuracy: 'abc' })).length > 0);

  const point = { idempotencyKey: 'batch-key-0001', ...base };
  assert.equal((await runRules(validateLocationBatchRules, { points: [{ ...point, accuracy: null }, { ...point }] })).length, 0);
  assert.ok((await runRules(validateLocationBatchRules, { points: [{ ...point, accuracy: -1 }] })).length > 0);
  assert.ok(chatRules.length > 0);
});
