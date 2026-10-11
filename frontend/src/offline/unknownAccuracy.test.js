const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateReadings } = require('./deviceGeofence');
const { initialState } = require('./deviceCore');
const { clientConfigDefaults } = require('./offlineConfig');

const NOW = new Date('2026-10-12T10:00:00Z');
const cell = { h3Index: 'x', level: 'HIGH', score: 75, baseRisk: 75, confidence: 0.9, lowConfidence: false, demo: false, fetchedAt: NOW.getTime() };
const opts = { getCell: async () => cell, clientConfig: clientConfigDefaults, now: NOW };
const at = (s) => new Date(NOW.getTime() - 60000 + s * 1000).toISOString();

test('on the device an unknown-accuracy reading is ignored like a low-accuracy one: no danger episode starts', async () => {
  const readings = [0, 10, 20, 30, 40].map((s) => ({ h3Index: 'x', timestamp: at(s), accuracy: null }));
  const out = await evaluateReadings(initialState(), readings, opts);
  assert.equal(out.accepted, 0);
  assert.equal(out.skipped.lowAccuracy, 5);
  assert.deepEqual(out.events, []);
  assert.equal(out.state.phase, 'SAFE');
});

test('known accuracy readings at the same place do start the episode', async () => {
  const readings = [0, 10, 20].map((s) => ({ h3Index: 'x', timestamp: at(s), accuracy: 12 }));
  const out = await evaluateReadings(initialState(), readings, opts);
  assert.equal(out.accepted, 3);
  assert.ok(out.events.some((e) => e.event === 'ENTER'));
});
