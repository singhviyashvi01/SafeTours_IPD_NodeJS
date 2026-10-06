const test = require('node:test');
const assert = require('node:assert/strict');
const h3 = require('h3-js');
const core = require('./deviceCore');
const { cellRiskAt, evaluateReadings } = require('./deviceGeofence');
const { clientConfigDefaults } = require('./offlineConfig');

const cfg = clientConfigDefaults;
const NOW = new Date('2026-10-06T06:30:00Z'); // 12:00 IST (day)
const NIGHT = new Date('2026-10-06T18:30:00Z'); // 00:00 IST
const cell = h3.latLngToCell(19.0178, 72.8478, 9);

const row = (over = {}) => ({ h3Index: cell, level: 'HIGH', score: 70, baseRisk: 70, confidence: 0.7, lowConfidence: false, demo: false, fetchedAt: NOW.getTime() - 3600000, ...over });
const at = (sec) => NOW.getTime() - 60000 + sec * 1000;
const reading = (sec, extra = {}) => ({ h3Index: cell, timestamp: at(sec), latitude: 19.0178, longitude: 72.8478, accuracy: 10, ...extra });

test('a cell that is not cached is NO DATA (UNKNOWN, null score), never SAFE', () => {
  const r = cellRiskAt(null, NOW.getTime(), cfg.risk);
  assert.equal(r.riskLevel, 'UNKNOWN');
  assert.equal(r.totalRisk, null);
  assert.equal(r.noData, true);
});

test('a cell the server itself reported as UNKNOWN stays UNKNOWN offline', () => {
  const r = cellRiskAt(row({ level: 'UNKNOWN', score: null, baseRisk: null }), NOW.getTime(), cfg.risk);
  assert.equal(r.riskLevel, 'UNKNOWN');
  assert.equal(r.totalRisk, null);
});

test('the time-of-day modifier is re-applied to baseRisk offline (night > day) using the shared code', () => {
  const day = cellRiskAt(row({ baseRisk: 50, score: 50 }), NOW.getTime(), cfg.risk);
  const night = cellRiskAt(row({ baseRisk: 50, score: 50 }), NIGHT.getTime(), cfg.risk);
  assert.equal(day.totalRisk, 50);
  assert.equal(night.totalRisk, 60);
  assert.equal(night.riskLevel, 'HIGH');
  assert.equal(day.riskLevel, 'MODERATE');
  // clamped
  assert.equal(cellRiskAt(row({ baseRisk: 95 }), NIGHT.getTime(), cfg.risk).totalRisk, 100);
});

test('demo / lowConfidence flags survive the cache', () => {
  const r = cellRiskAt(row({ demo: true, lowConfidence: true }), NOW.getTime(), cfg.risk);
  assert.equal(r.demo, true);
  assert.equal(r.lowConfidence, true);
});

test('offline dwell: ENTER after 3 consecutive danger readings, tagged source "device", with the server thresholds', async () => {
  const getCell = async () => row();
  const clientConfig = { geofence: cfg.geofence, risk: cfg.risk };
  const r = await evaluateReadings(core.initialState(), [reading(0), reading(5), reading(10)], { getCell, clientConfig, now: NOW });
  assert.equal(r.source, 'device');
  assert.deepEqual(r.events.map((e) => e.event), ['ENTER']);
  assert.equal(r.state.phase, 'IN_DANGER');
  assert.equal(r.events[0].riskLevel, 'HIGH');
});

test('offline hysteresis: scores between exit (52) and enter (60) keep you inside; below 52 for 3 readings exits', async () => {
  const clientConfig = { geofence: cfg.geofence, risk: cfg.risk };
  let score = 70;
  const getCell = async () => row({ score, baseRisk: score });
  let r = await evaluateReadings(core.initialState(), [reading(0), reading(5), reading(10)], { getCell, clientConfig, now: NOW });
  score = 55;
  r = await evaluateReadings(r.state, [reading(15), reading(20), reading(25)], { getCell, clientConfig, now: NOW });
  assert.equal(r.state.phase, 'IN_DANGER');
  score = 40;
  r = await evaluateReadings(r.state, [reading(30), reading(35), reading(40)], { getCell, clientConfig, now: NOW });
  assert.deepEqual(r.events.map((e) => e.event), ['EXIT']);
});

test('cells missing from the cache never produce an ENTER, however long the user stays', async () => {
  const clientConfig = { geofence: cfg.geofence, risk: cfg.risk };
  const r = await evaluateReadings(core.initialState(), [0, 5, 10, 15, 20, 120].map(reading), { getCell: async () => null, clientConfig, now: NOW });
  assert.equal(r.events.length, 0);
  assert.equal(r.state.phase, 'SAFE');
  assert.equal(r.last.risk.noData, true);
});

test('accuracy cap and duplicate protection also apply on the device', async () => {
  const clientConfig = { geofence: { ...cfg.geofence, accuracyMaxMeters: 100 }, risk: cfg.risk };
  const getCell = async () => row();
  let r = await evaluateReadings(core.initialState(), [reading(0, { accuracy: 120 }), reading(5, { accuracy: 100 })], { getCell, clientConfig, now: NOW });
  assert.equal(r.skipped.lowAccuracy, 1);
  assert.equal(r.accepted, 1);
  const again = await evaluateReadings(r.state, [reading(5, { accuracy: 100 })], { getCell, clientConfig, now: NOW });
  assert.equal(again.skipped.duplicateOrOlder, 1);
});
