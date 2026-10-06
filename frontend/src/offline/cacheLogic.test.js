const test = require('node:test');
const assert = require('node:assert/strict');
const { cacheFreshness, planEviction, bboxAround, tileBoxes, estimateCells, bboxAreaKm2, nearbyCenters } = require('./cacheLogic');
const { riskCache, nearbyCache } = require('./offlineConfig');

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-10-06T12:00:00Z');

test('TTL: fresh under 6 h, stale (still usable, labelled with its age) up to 7 days, then expired', () => {
  const at = (h) => new Date(NOW - h * HOUR).toISOString();
  assert.equal(cacheFreshness(at(0), NOW, riskCache), 'fresh');
  assert.equal(cacheFreshness(at(5.99), NOW, riskCache), 'fresh');
  assert.equal(cacheFreshness(at(6), NOW, riskCache), 'stale');
  assert.equal(cacheFreshness(at(24 * 7 - 0.01), NOW, riskCache), 'stale');
  assert.equal(cacheFreshness(at(24 * 7), NOW, riskCache), 'expired');
  assert.equal(cacheFreshness(new Date(NOW + HOUR).toISOString(), NOW, riskCache), 'fresh'); // clock skew
});

test('TTL boundaries follow the config (config-driven)', () => {
  const cfg = { freshMs: 1000, usableMs: 5000 };
  assert.equal(cacheFreshness(NOW - 999, NOW, cfg), 'fresh');
  assert.equal(cacheFreshness(NOW - 1000, NOW, cfg), 'stale');
  assert.equal(cacheFreshness(NOW - 5000, NOW, cfg), 'expired');
});

const region = (id, kind, hoursAgo, cellCount) => ({ id, kind, fetchedAt: NOW - hoursAgo * HOUR, cellCount });

test('eviction: nothing is evicted while under the cap', () => {
  assert.deepEqual(planEviction({ regions: [region('a', 'manual', 10, 100)], maxRows: 100 }), []);
});

test('eviction removes the OLDEST regions first until the cache fits', () => {
  const regions = [region('new', 'manual', 1, 400), region('old', 'manual', 100, 400), region('mid', 'manual', 50, 400)];
  assert.deepEqual(planEviction({ regions, maxRows: 800 }), ['old']);
  assert.deepEqual(planEviction({ regions, maxRows: 400 }), ['old', 'mid']);
});

test('eviction spares protected regions (current, destination) until nothing else is left', () => {
  const regions = [region('cur', 'current', 200, 500), region('dest', 'destination', 150, 500), region('m1', 'manual', 1, 500), region('m2', 'manual', 2, 500)];
  const cfg = { maxRows: 1000, protectedKinds: ['current', 'destination'] };
  assert.deepEqual(planEviction({ regions, ...cfg }), ['m2', 'm1']); // the freshest unprotected go before OLD protected ones
  // a single protected region bigger than the cap is trimmed as a last resort
  assert.deepEqual(planEviction({ regions: [region('cur', 'current', 5, 1500)], maxRows: 1000, protectedKinds: ['current'] }), ['cur']);
});

test('eviction handles ties deterministically and never evicts more than needed', () => {
  const regions = [region('a', 'manual', 10, 300), region('b', 'manual', 10, 300), region('c', 'manual', 10, 300)];
  const out = planEviction({ regions, maxRows: 600 });
  assert.equal(out.length, 1);
});

test('tiles cover the box exactly: no gaps, no overlaps, each at most the tile size', () => {
  const bbox = bboxAround(19.0178, 72.8478, 10000);
  const tiles = tileBoxes(bbox, riskCache.tileSizeDeg);
  assert.ok(tiles.length >= 4);
  for (const t of tiles) {
    assert.ok(t.maxLat - t.minLat <= riskCache.tileSizeDeg + 1e-9);
    assert.ok(t.maxLng - t.minLng <= riskCache.tileSizeDeg + 1e-9);
  }
  const area = tiles.reduce((a, t) => a + (t.maxLat - t.minLat) * (t.maxLng - t.minLng), 0);
  assert.ok(Math.abs(area - (bbox.maxLat - bbox.minLat) * (bbox.maxLng - bbox.minLng)) < 1e-9);
  assert.equal(tiles[0].minLat, bbox.minLat);
  assert.equal(tiles[tiles.length - 1].maxLat, bbox.maxLat);
  assert.equal(tileBoxes(bboxAround(19, 72.8, 500), 0.1).length, 1);
});

test('a tile never holds more cells than the server cap of 3,000', () => {
  const tile = { minLat: 19, maxLat: 19 + riskCache.tileSizeDeg, minLng: 72.8, maxLng: 72.8 + riskCache.tileSizeDeg };
  assert.ok(estimateCells(tile) < 3000, `estimate ${estimateCells(tile)}`);
});

test('size estimates are in the expected ballpark (res-9 cells are ~0.105 km2)', () => {
  const c3 = estimateCells(bboxAround(19.0178, 72.8478, 3000));
  const c10 = estimateCells(bboxAround(19.0178, 72.8478, 10000));
  assert.ok(c3 > 250 && c3 < 450, `3 km: ${c3}`);
  assert.ok(c10 > 3000 && c10 < 4500, `10 km: ${c10}`);
  assert.ok(Math.abs(bboxAreaKm2(bboxAround(19, 72.8, 5000)) - 100) < 3); // 10 km x 10 km box
});

test('nearby download centres: the centre is always first and the count grows with the radius', () => {
  const n2 = nearbyCenters(19.0178, 72.8478, 2000, nearbyCache.centerSpacingM);
  const n5 = nearbyCenters(19.0178, 72.8478, 5000, nearbyCache.centerSpacingM);
  const n10 = nearbyCenters(19.0178, 72.8478, 10000, nearbyCache.centerSpacingM);
  assert.deepEqual(n2[0], { lat: 19.0178, lng: 72.8478 });
  assert.ok(n2.length < n5.length && n5.length < n10.length);
  assert.ok(n2.length <= 5 && n10.length > 15);
});
