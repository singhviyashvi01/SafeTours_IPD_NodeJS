const test = require('node:test');
const assert = require('node:assert/strict');
const h3 = require('h3-js');
const { parseCsv, normalizeRows, dbscan, scoreCells, runPipeline } = require('./crimePipeline');

const NOW = new Date('2026-10-03T00:00:00Z');

test('parseCsv handles quotes, commas in fields, CRLF and header aliases', () => {
  const rows = parseCsv('Lat,Lng,Crime Type,Date\r\n19.07,72.87,"Theft, minor",2026-09-01\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lat, '19.07');
  assert.equal(rows[0].crime_type, 'Theft, minor');
});

test('rows outside the Mumbai box or with bad data are dropped and counted (never used to score Mumbai)', () => {
  const rows = parseCsv(
    [
      'lat,lng,crime_type,date',
      '19.07,72.87,Theft,2026-09-01', // ok
      '26.80,76.88,Theft,2026-09-01', // outside region
      'abc,72.87,Theft,2026-09-01', // bad coordinate
      '19.07,72.87,Theft,not-a-date', // bad date
      '19.07,72.87,Theft,2015-01-01', // too old
      '19.07,72.87,Theft,2027-06-01', // future
    ].join('\n')
  );
  const { incidents, dropped } = normalizeRows(rows, { now: NOW });
  assert.equal(incidents.length, 1);
  assert.deepEqual(dropped, { invalidCoordinates: 1, outsideRegion: 1, invalidDate: 1, tooOld: 1, inFuture: 1 });
});

test('severity comes from the crime type; unknown types are reported', () => {
  const rows = parseCsv('lat,lng,crime_type,date\n19.07,72.87,Murder,2026-09-01\n19.07,72.87,Zorb,2026-09-01');
  const { incidents, unknownTypes } = normalizeRows(rows, { now: NOW });
  assert.equal(incidents[0].severity, 10);
  assert.equal(incidents[1].severity, 4); // default
  assert.deepEqual(unknownTypes, { zorb: 1 });
});

test('recency: an incident one half-life old weighs half as much', () => {
  const rows = parseCsv('lat,lng,crime_type,date\n19.07,72.87,Theft,2026-10-03\n19.07,72.87,Theft,2025-10-03');
  const { incidents } = normalizeRows(rows, { now: NOW });
  assert.ok(Math.abs(incidents[1].weight / incidents[0].weight - 0.5) < 0.01);
});

test('dbscan: dense group is one cluster, lone points are noise, haversine eps is respected', () => {
  const dense = Array.from({ length: 6 }, (_, i) => ({ lat: 19.07 + i * 0.0002, lng: 72.87 })); // ~22 m apart
  const far = { lat: 19.2, lng: 72.9 };
  const labels = dbscan([...dense, far], 250, 4);
  assert.ok(dense.every((_, i) => labels[i] === 0));
  assert.equal(labels[6], -1);
  // two groups 1 km apart do not merge
  const groupB = dense.map((p) => ({ lat: p.lat + 0.009, lng: p.lng }));
  const l2 = dbscan([...dense, ...groupB], 250, 4);
  assert.notEqual(l2[0], l2[6]);
});

test('scoring: hotspot cell scores highest, spreads to neighbours with decay, far cells are 0', () => {
  const lat = 19.07;
  const lng = 72.87;
  const incidents = Array.from({ length: 8 }, () => ({ lat, lng, weight: 6 }));
  const labels = new Int32Array(8).fill(0);
  const center = h3.latLngToCell(lat, lng, 9);
  const ring1 = h3.gridDiskDistances(center, 3)[1][0];
  const ring3 = h3.gridDiskDistances(center, 3)[3][0];
  const grid = h3.gridDisk(center, 4);
  const { scores } = scoreCells(incidents, labels, grid);
  assert.ok(scores[center] > scores[ring1]);
  assert.ok(scores[ring1] > 0);
  assert.equal(scores[ring3], 0); // beyond maxRing 2
  assert.ok(Object.values(scores).every((s) => s >= 0 && s <= 100));
});

test('noise points count less than clustered points', () => {
  const inc = [{ lat: 19.07, lng: 72.87, weight: 10 }];
  const cell = h3.latLngToCell(19.07, 72.87, 9);
  const clustered = scoreCells(inc, new Int32Array([0]), [cell]).scores[cell];
  const lonely = scoreCells(inc, new Int32Array([-1]), [cell]).scores[cell];
  // single cell => normalised against itself, so compare raw through two cells
  const other = [{ lat: 19.07, lng: 72.87, weight: 10 }, { lat: 19.2, lng: 72.9, weight: 10 }];
  const c2 = h3.latLngToCell(19.2, 72.9, 9);
  const mixed = scoreCells(other, new Int32Array([0, -1]), [cell, c2]).scores;
  assert.ok(mixed[cell] > mixed[c2]);
  assert.ok(clustered >= 0 && lonely >= 0);
});

test('runPipeline: thin data is flagged lowConfidence', () => {
  const csv = 'lat,lng,crime_type,date\n19.07,72.87,Theft,2026-09-01';
  const cell = h3.latLngToCell(19.07, 72.87, 9);
  const r = runPipeline(csv, [cell], { now: NOW });
  assert.equal(r.lowConfidence, true);
  assert.equal(r.stats.rowsRead, 1);
});
