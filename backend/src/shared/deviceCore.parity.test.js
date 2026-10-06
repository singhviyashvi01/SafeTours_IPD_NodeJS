const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const h3 = require('h3-js');

// The server's own defaults, not whatever the developer's .env overrides.
for (const k of Object.keys(process.env)) if (/^(GEOFENCE_|SOS_|JOURNEY_)/.test(k)) delete process.env[k];

const backendCore = require('./deviceCore');
const geofenceCfg = require('../config/geofence.config');
const riskCfg = require('../config/risk.config');
const engine = require('../services/risk/riskEngine');
const metaRoutes = require('../routes/meta.routes');

const FRONT = path.resolve(__dirname, '../../../frontend/src/offline');
const frontendPresent = fs.existsSync(path.join(FRONT, 'deviceCore.js'));
const skip = frontendPresent ? false : 'frontend folder not present (backend deployed alone)';

const frontCore = frontendPresent ? require(path.join(FRONT, 'deviceCore.js')) : null;
const frontGeo = frontendPresent ? require(path.join(FRONT, 'deviceGeofence.js')) : null;
const frontConfig = frontendPresent ? require(path.join(FRONT, 'offlineConfig.js')) : null;

const norm = (s) => s.replace(/\r\n/g, '\n');

test('the device copy of deviceCore.js is byte-identical to the backend source (run: npm run sync:device-core)', { skip }, () => {
  const a = norm(fs.readFileSync(path.join(__dirname, 'deviceCore.js'), 'utf8'));
  const b = norm(fs.readFileSync(path.join(FRONT, 'deviceCore.js'), 'utf8'));
  assert.equal(b, a, 'frontend/src/offline/deviceCore.js differs from backend/src/shared/deviceCore.js');
});

// ── shared fixtures: the same readings through both copies ─────────────────────

const cfg = { ...geofenceCfg };
const NOW = new Date('2026-10-06T12:00:00Z');
const at = (sec) => NOW.getTime() - 3600000 + sec * 1000; // an hour ago (historical)
const fresh = (sec) => NOW.getTime() - 120000 + sec * 1000; // within the last 2 minutes (not historical)
const D = (s, t = at) => ({ h3Index: 'danger', timestamp: t(s), accuracy: 10 });
const S = (s, t = at) => ({ h3Index: 'safe', timestamp: t(s), accuracy: 10 });
const U = (s, t = at) => ({ h3Index: 'unknown', timestamp: t(s), accuracy: 10 });

const risks = {
  danger: { riskLevel: 'HIGH', totalRisk: 70 },
  border: { riskLevel: 'MODERATE', totalRisk: 55 },
  safe: { riskLevel: 'LOW', totalRisk: 30 },
  unknown: { riskLevel: 'UNKNOWN', totalRisk: null },
};
const resolveRisk = async (h3) => risks[h3];

const FIXTURES = [
  { name: 'enter by readings then exit by readings', readings: [D(0), D(5), D(10), S(15), S(20), S(25)], events: ['ENTER', 'EXIT'] },
  { name: 'enter by dwell time (2 readings 61 s apart)', readings: [D(0), D(61)], events: ['ENTER'] },
  { name: 'a single reading never enters', readings: [D(0)], events: [] },
  { name: 'interrupted entry resets', readings: [D(0), D(5), S(10), D(15), D(20)], events: [] },
  { name: 'unknown cells never enter', readings: [U(0), U(5), U(10), U(400)], events: [] },
  // 55 is below the enter score (60) but above the exit score (52): still inside; the level change is history only
  { name: 'border scores keep you inside', readings: [D(0), D(5), D(10), { h3Index: 'border', timestamp: at(15) }, { h3Index: 'border', timestamp: at(20) }, { h3Index: 'border', timestamp: at(25) }], events: ['ENTER', 'ZONE_CHANGED'] },
  { name: 'low accuracy readings are ignored', readings: [{ ...D(0), accuracy: 400 }, { ...D(5), accuracy: 400 }, { ...D(10), accuracy: 400 }], events: [] },
  { name: 'duplicate timestamps are skipped', readings: [D(0), D(0), D(5), D(5), D(10)], events: ['ENTER'] },
  { name: 'unsorted batch is replayed in time order', readings: [S(25), D(10), D(0), S(15), D(5), S(20)], events: ['ENTER', 'EXIT'] },
  { name: 'fresh events are not historical', readings: [D(0, fresh), D(5, fresh), D(10, fresh)], events: ['ENTER'] },
];

for (const f of FIXTURES) {
  test(`fixture parity: ${f.name}`, { skip }, async () => {
    const run = (core) => core.processReadings(core.initialState(), f.readings, { resolveRisk, now: NOW, cfg });
    const [a, b] = [await run(backendCore), await run(frontCore)];
    assert.deepEqual(b, a); // identical results from the device copy
    assert.deepEqual(a.events.map((e) => e.event), f.events); // and they match the golden expectation
  });
}

test('historical flag: old events are historical, fresh ones are not (same in both copies)', { skip }, async () => {
  for (const core of [backendCore, frontCore]) {
    const old = await core.processReadings(core.initialState(), [D(0), D(5), D(10)], { resolveRisk, now: NOW, cfg });
    const live = await core.processReadings(core.initialState(), [D(0, fresh), D(5, fresh), D(10, fresh)], { resolveRisk, now: NOW, cfg });
    assert.equal(old.events[0].historical, true);
    assert.equal(live.events[0].historical, false);
  }
});

// ── time modifier: fixed-offset path vs Intl reference ─────────────────────────

function intlReference(now) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: riskCfg.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24 };
}

test('IST arithmetic matches Intl for 500 timestamps across a year (so Hermes needs no Intl time zones)', () => {
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < 500; i += 1) {
    const d = new Date(start + i * 17 * 3600000 + i * 61000);
    assert.deepEqual(backendCore.localTime(d, riskCfg.timezone), intlReference(d), d.toISOString());
  }
});

test('timeModifier: both copies agree with the risk engine (night, evening, day, festival)', { skip }, () => {
  const stamps = ['2026-10-06T18:30:00Z', '2026-10-06T14:00:00Z', '2026-10-06T06:30:00Z', '2026-11-08T06:30:00Z', '2026-12-31T20:00:00Z', '2026-03-04T23:30:00Z'];
  const devCfg = { timezone: riskCfg.timezone, timeModifier: riskCfg.timeModifier, festivals: riskCfg.festivals };
  for (const s of stamps) {
    const d = new Date(s);
    const expected = engine.timeModifier(d);
    assert.deepEqual(backendCore.timeModifier(d, devCfg), expected);
    assert.deepEqual(frontCore.timeModifier(d, devCfg), expected);
  }
});

// ── the device score equals the server score ───────────────────────────────────

test('device recomputation from baseRisk equals the server totalRisk at any time while data is fresh', { skip }, () => {
  const t1 = new Date('2026-10-06T06:30:00Z'); // 12:00 IST when the cell was cached
  const comps = (now) => ({ crime: { score: 80, updatedAt: now }, weather: { score: 30, updatedAt: now }, crowd: { score: 50, updatedAt: now }, community: { score: 10 }, news: { score: 0 } });
  const feeds = { news: { updatedAt: t1 }, community: { updatedAt: t1 } };
  const cached = engine.evaluate({ components: comps(t1), feeds, now: t1 });
  const row = { h3Index: 'x', level: cached.level, score: cached.totalRisk, baseRisk: cached.baseRisk, confidence: cached.dataConfidence, lowConfidence: cached.lowConfidence, demo: cached.demo, fetchedAt: t1.getTime() };
  const devCfg = frontConfig.clientConfigDefaults.risk;

  for (const later of ['2026-10-06T06:45:00Z', '2026-10-06T14:00:00Z', '2026-10-06T18:40:00Z', '2026-10-06T20:00:00Z']) {
    const t = new Date(later);
    const server = engine.evaluate({ components: comps(t1), feeds, now: t });
    // only compare while the engine still sees everything fresh (weather ttl 90 min)
    if (t.getTime() - t1.getTime() > 80 * 60000) {
      // ages differ, so compare against an engine run whose data is as fresh as at caching time
      const same = engine.evaluate({ components: comps(t), feeds: { news: { updatedAt: t }, community: { updatedAt: t } }, now: t });
      assert.equal(frontGeo.cellRiskAt(row, t.getTime(), devCfg).totalRisk, same.totalRisk, later);
      assert.equal(frontGeo.cellRiskAt(row, t.getTime(), devCfg).riskLevel, same.level, later);
    } else {
      assert.equal(frontGeo.cellRiskAt(row, t.getTime(), devCfg).totalRisk, server.totalRisk, later);
    }
  }
});

// ── defaults on the phone == the server's config ───────────────────────────────

test('built-in client defaults equal GET /api/config/client (so a never-online phone behaves like the server)', { skip }, async () => {
  const app = express();
  app.use('/api', metaRoutes);
  const server = await new Promise((resolve) => { const s = http.createServer(app).listen(0, () => resolve(s)); });
  try {
    const { port } = server.address();
    const body = await (await fetch(`http://127.0.0.1:${port}/api/config/client`)).json();
    assert.deepEqual(body.geofence, frontConfig.clientConfigDefaults.geofence);
    assert.deepEqual(body.risk, frontConfig.clientConfigDefaults.risk);
    const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
    assert.equal(health.status, 'ok');
  } finally {
    server.close();
  }
});
