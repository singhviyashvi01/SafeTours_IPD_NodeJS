const test = require('node:test');
const assert = require('node:assert/strict');
const { initialState, step, isInside } = require('./geofenceStateMachine');

const cfg = {
  enterScore: 60,
  exitScore: 52,
  enterReadings: 3,
  enterDwellSeconds: 60,
  exitReadings: 3,
  exitDwellSeconds: 90,
  minReadingsForDwell: 2,
};
const T0 = Date.parse('2026-10-03T10:00:00Z');
const obs = (score, secs, level) => ({
  h3Index: 'cell',
  riskLevel: level || (score === null ? 'UNKNOWN' : score >= 80 ? 'EXTREME' : score >= 60 ? 'HIGH' : 'LOW'),
  totalRisk: score,
  timestamp: T0 + secs * 1000,
});
const run = (state, list) => {
  const events = [];
  let s = state;
  for (const o of list) {
    const r = step(s, o, cfg);
    s = r.state;
    events.push(r.event);
  }
  return { s, events };
};

test('dwell by readings: ENTER only on the 3rd consecutive danger reading', () => {
  const { s, events } = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]);
  assert.deepEqual(events, ['NO_CHANGE', 'NO_CHANGE', 'ENTER']);
  assert.equal(s.phase, 'IN_DANGER');
  assert.equal(isInside(s), true);
});

test('dwell by time: 2 readings 60 s apart are enough', () => {
  const { events } = run(initialState(), [obs(70, 0), obs(70, 61)]);
  assert.deepEqual(events, ['NO_CHANGE', 'ENTER']);
});

test('a single reading never enters, however long ago it was (needs minReadingsForDwell)', () => {
  const { events, s } = run(initialState(), [obs(70, 0)]);
  assert.deepEqual(events, ['NO_CHANGE']);
  assert.equal(s.phase, 'ENTERING');
});

test('a non-danger reading resets the entry counter (consecutive readings required)', () => {
  const { s, events } = run(initialState(), [obs(70, 0), obs(70, 5), obs(30, 10), obs(70, 15), obs(70, 20)]);
  assert.ok(!events.includes('ENTER'));
  assert.equal(s.phase, 'ENTERING');
  assert.equal(s.dangerReadings, 2);
});

test('UNKNOWN (no data) never counts as danger and never enters', () => {
  const { s, events } = run(initialState(), [obs(null, 0), obs(null, 5), obs(null, 10), obs(null, 400)]);
  assert.deepEqual(events, ['NO_CHANGE', 'NO_CHANGE', 'NO_CHANGE', 'NO_CHANGE']);
  assert.equal(s.phase, 'SAFE');
});

test('score just below the enter threshold does not start entering', () => {
  const { s } = run(initialState(), [obs(59.9, 0), obs(59.9, 5), obs(59.9, 10)]);
  assert.equal(s.phase, 'SAFE');
});

test('hysteresis: once inside, scores between exit (52) and enter (60) keep the user inside', () => {
  const entered = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  const { s, events } = run(entered, [obs(55, 15), obs(55, 20), obs(55, 25), obs(55, 30)]);
  assert.equal(s.phase, 'IN_DANGER');
  assert.ok(!events.includes('EXIT'));
});

test('EXIT needs M consecutive readings below the exit threshold', () => {
  const entered = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  const { s, events } = run(entered, [obs(40, 15), obs(40, 20), obs(40, 25)]);
  assert.deepEqual(events, ['NO_CHANGE', 'NO_CHANGE', 'EXIT']);
  assert.equal(s.phase, 'SAFE');
});

test('EXIT by dwell time: 2 safe readings 90 s apart', () => {
  const entered = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  const { events } = run(entered, [obs(40, 15), obs(40, 110)]);
  assert.deepEqual(events, ['NO_CHANGE', 'EXIT']);
});

test('no flapping on the border: alternating 61 / 55 never produces an EXIT', () => {
  const entered = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  const list = [];
  for (let i = 0; i < 12; i += 1) list.push(obs(i % 2 ? 55 : 61, 15 + i * 5));
  const { events, s } = run(entered, list);
  assert.ok(!events.includes('EXIT'));
  assert.equal(s.phase, 'IN_DANGER');
});

test('a danger reading while EXITING cancels the exit and resets the safe counter', () => {
  const entered = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  const { s } = run(entered, [obs(40, 15), obs(40, 20), obs(70, 25)]);
  assert.equal(s.phase, 'IN_DANGER');
  assert.equal(s.safeReadings, 0);
});

test('unknown cell while inside counts toward leaving (no data is not danger)', () => {
  const entered = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  const { events } = run(entered, [obs(null, 15), obs(null, 20), obs(null, 25)]);
  assert.equal(events[2], 'EXIT');
});

test('level change inside the zone is a ZONE_CHANGED event (history only), not a new ENTER', () => {
  const entered = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  const { events } = run(entered, [obs(85, 15)]);
  assert.deepEqual(events, ['ZONE_CHANGED']);
});

test('a fresh ENTER resets episodePrompted so the next episode can prompt again', () => {
  let s = run(initialState(), [obs(70, 0), obs(70, 5), obs(70, 10)]).s;
  s = { ...s, episodePrompted: true };
  s = run(s, [obs(30, 15), obs(30, 20), obs(30, 25)]).s;
  assert.equal(s.episodePrompted, false);
});
