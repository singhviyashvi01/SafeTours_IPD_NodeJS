const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState } = require('./geofenceStateMachine');
const { processReadings } = require('./geofenceReplay');
const { evaluatePrompt, cooldownActive, pendingStatus, secondsLeft, confirmDeadline } = require('../sos/sosPolicy');

const cfg = {
  accuracyMaxMeters: 50,
  enterScore: 60,
  exitScore: 52,
  enterReadings: 3,
  enterDwellSeconds: 60,
  exitReadings: 3,
  exitDwellSeconds: 90,
  minReadingsForDwell: 2,
  historicalAfterMinutes: 10,
  futureToleranceSeconds: 60,
  sos: { cooldownRing: 2 },
};
const NOW = new Date('2026-10-03T12:00:00Z');
const at = (minAgo, sec = 0) => new Date(NOW.getTime() - minAgo * 60000 + sec * 1000).toISOString();
const resolveRisk = async (h3) => (h3.startsWith('danger') ? { riskLevel: 'HIGH', totalRisk: 70 } : h3.startsWith('unknown') ? { riskLevel: 'UNKNOWN', totalRisk: null } : { riskLevel: 'LOW', totalRisk: 30 });
const run = (state, readings) => processReadings(state, readings, { resolveRisk, now: NOW, cfg });

test('low-accuracy readings are ignored: no counters, no events', async () => {
  const r = await run(initialState(), [
    { h3Index: 'danger1', timestamp: at(1, 0), accuracy: 120 },
    { h3Index: 'danger1', timestamp: at(1, 5), accuracy: 51 },
    { h3Index: 'danger1', timestamp: at(1, 10), accuracy: 50 }, // exactly at the cap is accepted
  ]);
  assert.equal(r.skipped.lowAccuracy, 2);
  assert.equal(r.accepted, 1);
  assert.equal(r.state.dangerReadings, 1);
  assert.equal(r.events.length, 0);
});

test('replay generates ENTER/EXIT history in chronological order, even if the batch is unsorted', async () => {
  const pts = [
    { h3Index: 'safe1', timestamp: at(120, 40) },
    { h3Index: 'danger1', timestamp: at(120, 0) },
    { h3Index: 'danger1', timestamp: at(120, 10) },
    { h3Index: 'danger1', timestamp: at(120, 20) },
    { h3Index: 'safe1', timestamp: at(120, 30) },
    { h3Index: 'safe1', timestamp: at(120, 50) },
  ];
  const r = await run(initialState(), pts);
  assert.deepEqual(r.events.map((e) => e.event), ['ENTER', 'EXIT']);
  assert.ok(r.events[0].timestamp < r.events[1].timestamp);
});

test('events older than the historical window are flagged historical; fresh ones are not', async () => {
  const old = await run(initialState(), [0, 10, 20].map((s) => ({ h3Index: 'danger1', timestamp: at(120, s) })));
  assert.equal(old.events[0].event, 'ENTER');
  assert.equal(old.events[0].historical, true);

  const fresh = await run(initialState(), [0, 10, 20].map((s) => ({ h3Index: 'danger1', timestamp: at(1, s) })));
  assert.equal(fresh.events[0].historical, false);
});

test('re-sending the same batch is a no-op (de-duplicated by the persisted lastReadingAt)', async () => {
  const pts = [0, 10, 20].map((s) => ({ h3Index: 'danger1', timestamp: at(30, s) }));
  const first = await run(initialState(), pts);
  const second = await run(first.state, pts);
  assert.equal(second.accepted, 0);
  assert.equal(second.skipped.duplicateOrOlder, 3);
  assert.equal(second.events.length, 0);
  assert.deepEqual(second.state, first.state);
});

test('future-dated readings are rejected', async () => {
  const r = await run(initialState(), [{ h3Index: 'danger1', timestamp: new Date(NOW.getTime() + 10 * 60000).toISOString() }]);
  assert.equal(r.skipped.future, 1);
  assert.equal(r.accepted, 0);
});

test('unknown cells in a replay never create an ENTER', async () => {
  const r = await run(initialState(), [0, 10, 20, 30].map((s) => ({ h3Index: 'unknown1', timestamp: at(30, s) })));
  assert.equal(r.events.length, 0);
  assert.equal(r.state.phase, 'SAFE');
});

// ── stale replay vs live prompt (the SOS policy) ──────────────────────────────

const policyCfg = { historicalAfterMinutes: 10, sos: { cooldownRing: 2 } };
const prompt = (state, extra = {}) =>
  evaluatePrompt({ state, now: NOW, autoSosEnabled: true, hasActiveOrPending: false, cfg: policyCfg, ...extra });

test('stale replay: still in danger but the last point is old -> no prompt, episode NOT consumed', async () => {
  const r = await run(initialState(), [0, 10, 20].map((s) => ({ h3Index: 'danger1', timestamp: at(60, s) })));
  assert.equal(r.state.phase, 'IN_DANGER');
  const d = prompt(r.state);
  assert.equal(d.create, false);
  assert.equal(d.reason, 'stale-reading');
  assert.equal(d.markHandled, false);
});

test('replay whose last point is fresh and still in danger is treated as a live check -> prompt', async () => {
  const r = await run(initialState(), [
    ...[0, 10, 20].map((s) => ({ h3Index: 'danger1', timestamp: at(120, s) })), // old history
    { h3Index: 'danger1', timestamp: at(1, 0) }, // fresh last point
  ]);
  assert.equal(r.state.phase, 'IN_DANGER');
  const d = prompt(r.state);
  assert.equal(d.create, true);
});

test('a prompted episode is not prompted again (no spam on every later reading)', () => {
  const state = { ...initialState(), phase: 'IN_DANGER', lastReadingAt: NOW.getTime() - 5000, episodePrompted: true, currentH3: 'danger1' };
  assert.equal(prompt(state).create, false);
  assert.equal(prompt(state).reason, 'already-handled');
});

test('duplicate suppression: an existing pending or active SOS prevents a second one', () => {
  const state = { ...initialState(), phase: 'IN_DANGER', lastReadingAt: NOW.getTime() - 5000, currentH3: 'danger1' };
  const d = prompt(state, { hasActiveOrPending: true });
  assert.equal(d.create, false);
  assert.equal(d.reason, 'duplicate-suppressed');
  assert.equal(d.markHandled, true);
});

test('auto-SOS opt-out: no prompt is created, but the episode is consumed', () => {
  const state = { ...initialState(), phase: 'IN_DANGER', lastReadingAt: NOW.getTime() - 5000, currentH3: 'danger1' };
  const d = prompt(state, { autoSosEnabled: false });
  assert.equal(d.create, false);
  assert.equal(d.reason, 'auto-sos-disabled');
});

test('cooldown after a cancel suppresses a new geofence prompt around that cell until it expires', () => {
  const h3 = require('h3-js');
  const cell = h3.latLngToCell(19.07, 72.87, 9);
  const nearby = h3.gridDiskDistances(cell, 3)[2][0]; // 2 rings away
  const far = h3.gridDiskDistances(cell, 5)[5][0];
  const base = { ...initialState(), phase: 'IN_DANGER', lastReadingAt: NOW.getTime() - 5000, cooldownCell: cell, cooldownUntil: new Date(NOW.getTime() + 20 * 60000) };

  assert.equal(cooldownActive({ ...base, currentH3: nearby }, NOW, policyCfg), true);
  assert.equal(prompt({ ...base, currentH3: nearby }).reason, 'cooldown');
  assert.equal(cooldownActive({ ...base, currentH3: far }, NOW, policyCfg), false);
  assert.equal(prompt({ ...base, currentH3: far }).create, true);
  const expired = { ...base, currentH3: nearby, cooldownUntil: new Date(NOW.getTime() - 1000) };
  assert.equal(cooldownActive(expired, NOW, policyCfg), false);
});

test('cancel window: a pending check is "waiting" until its deadline and only then "expired"', () => {
  const rec = { confirmBy: confirmDeadline(NOW, 60) };
  assert.equal(pendingStatus(rec, NOW), 'waiting');
  assert.equal(pendingStatus(rec, new Date(NOW.getTime() + 59000)), 'waiting');
  assert.equal(pendingStatus(rec, new Date(NOW.getTime() + 60000)), 'expired');
  assert.equal(secondsLeft(rec, NOW), 60);
  assert.equal(secondsLeft(rec, new Date(NOW.getTime() + 61000)), 0);
});
