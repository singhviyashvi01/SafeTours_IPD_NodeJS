const test = require('node:test');
const assert = require('node:assert/strict');
const h3 = require('h3-js');
const { buildPotentials, crowdScore, profileMultiplier } = require('./crowdModel');

// Dadar station-ish
const station = { name: 'Dadar', lat: 19.0178, lon: 72.8434, key: 'railway_station' };
const cell = h3.latLngToCell(station.lat, station.lon, 9);

// IST times: 2026-10-05 is a Monday, 2026-10-03 a Saturday (no festival on either)
const MON_8AM = new Date('2026-10-05T02:30:00Z'); // 08:00 IST
const MON_3AM = new Date('2026-10-04T21:30:00Z'); // 03:00 IST
const SAT_9PM = new Date('2026-10-03T15:30:00Z'); // 21:00 IST

test('a station makes its own cell and neighbours crowded, far cells untouched', () => {
  const pot = buildPotentials([station]);
  assert.ok(pot.get(cell).byProfile.commute > 0);
  assert.equal(pot.get(cell).poiCount, 1);
  assert.deepEqual(pot.get(cell).topPlaces, ['Dadar']);
  const ring1 = h3.gridDiskDistances(cell, 2)[1][0];
  assert.ok(pot.get(ring1).byProfile.commute < pot.get(cell).byProfile.commute);
  const far = h3.gridDiskDistances(cell, 4)[4][0];
  assert.equal(pot.has(far), false);
});

test('commute crowds peak at rush hour and vanish at 3am (IST)', () => {
  const p = buildPotentials([station]).get(cell).byProfile;
  const rush = crowdScore(p, { now: MON_8AM }).score;
  const night = crowdScore(p, { now: MON_3AM }).score;
  assert.ok(rush > night * 5, `rush ${rush} vs night ${night}`);
  assert.equal(crowdScore(p, { now: MON_8AM }).localHour, 8);
});

test('leisure places are busier on a weekend night than on a weekday night', () => {
  assert.ok(profileMultiplier('leisure', 21, true) > 0.9);
  assert.ok(profileMultiplier('leisure', 21, false) > 0.3);
  const mall = { name: 'Mall', lat: 19.0, lon: 72.83, key: 'shopping_mall' };
  const p = buildPotentials([mall]).get(h3.latLngToCell(19.0, 72.83, 9)).byProfile;
  const weekdayNoon = crowdScore(p, { now: new Date('2026-10-05T06:30:00Z') }).score; // Mon 12:00
  const satNight = crowdScore(p, { now: SAT_9PM }).score;
  assert.ok(satNight > weekdayNoon);
  assert.equal(crowdScore(p, { now: SAT_9PM }).weekend, true);
});

test('festival days raise crowd, and no places means score 0 for a cell with no potential', () => {
  const p = buildPotentials([station]).get(cell).byProfile;
  const normal = crowdScore(p, { now: new Date('2026-11-04T02:30:00Z') }).score; // 08:00 IST, no festival
  const diwali = crowdScore(p, { now: new Date('2026-11-09T02:30:00Z') });
  assert.equal(diwali.festival, 'Diwali');
  assert.ok(diwali.score > normal);
  assert.equal(crowdScore({}, { now: MON_8AM }).score, 0);
});

test('unknown categories and bad coordinates are ignored', () => {
  const pot = buildPotentials([{ name: 'x', lat: NaN, lon: 1, key: 'railway_station' }, { name: 'y', lat: 19, lon: 72.8, key: 'nope' }]);
  assert.equal(pot.size, 0);
});
