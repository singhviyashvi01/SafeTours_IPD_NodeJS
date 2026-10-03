const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Stub the three database-facing modules before loading the service.
const calls = [];
let feeds = {};
const stub = (rel, exports) => {
  const resolved = require.resolve(path.join(__dirname, rel));
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
};
stub('../../models/GridCell', {
  updateMany: async (...a) => { calls.push(['updateMany', ...a]); return { modifiedCount: 3 }; },
  find: () => ({
    select: () => ({ lean: async () => [
      { h3Index: '89608b1b00fffff', center: { lat: 19.0, lng: 72.85 } },
      { h3Index: '89608b189afffff', center: { lat: 19.1, lng: 72.9 } },
    ] }),
  }),
});
stub('../risk/cellRisk.service', { setComponentScores: async (...a) => { calls.push(['setComponentScores', ...a]); return {}; } });
stub('../risk/feedStatus.service', {
  getAll: async () => feeds,
  markSuccess: async (...a) => { calls.push(['markSuccess', ...a]); },
  clear: async (...a) => { calls.push(['clear', ...a]); },
});
const { syncDemoCrimeState } = require('./crimeDemo.service');

const run = async (flag, feedState) => {
  calls.length = 0;
  feeds = feedState;
  if (flag === undefined) delete process.env.USE_DEMO_CRIME_DATA;
  else process.env.USE_DEMO_CRIME_DATA = flag;
  return syncDemoCrimeState();
};

test('flag off (default) and no crime data: does nothing', async () => {
  const r = await run(undefined, {});
  assert.equal(r.action, 'none');
  assert.equal(calls.length, 0);
});

test('flag on and no real data: seeds demo scores tagged source "demo"', async () => {
  const r = await run('true', {});
  assert.equal(r.action, 'seeded');
  const write = calls.find((c) => c[0] === 'setComponentScores');
  assert.equal(write[1], 'crime');
  assert.equal(write[3].meta.source, 'demo');
  assert.equal(write[3].meta.demo, true);
  const scores = Object.values(write[2]);
  assert.equal(scores.length, 2);
  assert.ok(scores.every((s) => s >= 0 && s <= 100));
});

test('flag on but real CSV data is loaded: real data wins, nothing written', async () => {
  const r = await run('true', { crime: { updatedAt: new Date(), stats: { source: 'csv' } } });
  assert.equal(r.action, 'skipped-real-data');
  assert.equal(calls.length, 0);
});

test('flag on and demo already seeded recently: not re-seeded', async () => {
  const r = await run('true', { crime: { updatedAt: new Date(), stats: { source: 'demo' } } });
  assert.equal(r.action, 'already-seeded');
  assert.equal(calls.length, 0);
});

test('flag off but demo scores are present: they are removed', async () => {
  const r = await run('false', { crime: { updatedAt: new Date(), stats: { source: 'demo' } } });
  assert.equal(r.action, 'cleared');
  const upd = calls.find((c) => c[0] === 'updateMany');
  assert.deepEqual(upd[1], { 'components.crime.meta.source': 'demo' });
  assert.ok(calls.some((c) => c[0] === 'clear' && c[1] === 'crime'));
});

test('flag off and real CSV data: real data is never touched', async () => {
  const r = await run('false', { crime: { updatedAt: new Date(), stats: { source: 'csv' } } });
  assert.equal(r.action, 'none');
  assert.equal(calls.length, 0);
});
