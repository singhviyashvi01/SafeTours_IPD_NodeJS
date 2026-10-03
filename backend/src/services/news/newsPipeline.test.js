const test = require('node:test');
const assert = require('node:assert/strict');
const h3 = require('h3-js');
const { buildNewsScores } = require('./newsPipeline');

const NOW = new Date('2026-10-03T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3600000).toISOString();
const art = (title, h = 1, description = '') => ({ title, description, publishedAt: hoursAgo(h), source: 't' });
const andheri = h3.latLngToCell(19.1197, 72.8464, 9);

test('a located hazard affects its cell and the six neighbours only', async () => {
  const { scores } = await buildNewsScores([art('Massive fire breaks out in Andheri')], { now: NOW });
  const ring = h3.gridDiskDistances(andheri, 3);
  assert.ok(scores[andheri] > 0);
  for (const c of ring[1]) assert.ok(scores[c] > 0 && scores[c] < scores[andheri]);
  for (const c of ring[2]) assert.equal(scores[c], undefined);
  assert.equal(Object.keys(scores).length, 7);
});

test('an article with no extractable location contributes nothing (no city-wide score)', async () => {
  const r = await buildNewsScores([art('Massive fire breaks out in Mumbai'), art('Fire breaks out at a godown')], { now: NOW });
  assert.deepEqual(r.scores, {});
  assert.equal(r.stats.noLocation, 2);
});

test('non-hazard and figurative articles contribute nothing', async () => {
  const r = await buildNewsScores(
    [art('Flood of tourists in Colaba this Diwali'), art('Landslide victory for the party in Dadar'), art('New cafe opens in Bandra')],
    { now: NOW }
  );
  assert.deepEqual(r.scores, {});
  assert.equal(r.stats.notHazard, 3);
});

test('time decay: a fresh article scores more than a 12-hour-old one; 25h-old is dropped', async () => {
  const fresh = await buildNewsScores([art('Fire breaks out in Dadar', 0.5)], { now: NOW });
  const old = await buildNewsScores([art('Fire breaks out in Dadar', 12)], { now: NOW });
  const gone = await buildNewsScores([art('Fire breaks out in Dadar', 25)], { now: NOW });
  const dadar = h3.latLngToCell(19.0178, 72.8478, 9);
  assert.ok(fresh.scores[dadar] > old.scores[dadar] * 2);
  assert.deepEqual(gone.scores, {});
  assert.equal(gone.stats.tooOld, 1);
});

test('severity matters: collapse > fire > protest in the same place', async () => {
  const s = async (t) => (await buildNewsScores([art(t)], { now: NOW })).scores[andheri];
  assert.ok((await s('Building collapse in Andheri')) > (await s('Fire in Andheri')));
  assert.ok((await s('Fire in Andheri')) > (await s('Protest in Andheri')));
});

test('several articles in one place add up but saturate below 100', async () => {
  const many = Array.from({ length: 10 }, (_, i) => art(`Building collapse in Andheri ${i}`, 0.2));
  const { scores } = await buildNewsScores(many, { now: NOW });
  assert.ok(scores[andheri] > 90 && scores[andheri] <= 100);
});

test('places outside the gazetteer are geocoded (injected), and a failed geocode contributes nothing', async () => {
  const geocode = async (name) => (name === 'Antop Hill' ? { latitude: 19.0225, longitude: 72.8665 } : null);
  const ok = await buildNewsScores([art('Fire broke out near Antop Hill')], { now: NOW, geocode });
  assert.equal(ok.stats.counted, 1);
  const none = await buildNewsScores([art('Fire broke out near Nowhere Nagar')], { now: NOW, geocode });
  assert.equal(none.stats.noLocation, 1);
});

test('articles without a usable date are skipped (decay cannot be applied)', async () => {
  const r = await buildNewsScores([{ title: 'Fire in Dadar', description: '', publishedAt: null }], { now: NOW });
  assert.equal(r.stats.noDate, 1);
  assert.deepEqual(r.scores, {});
});
