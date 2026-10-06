const test = require('node:test');
const assert = require('node:assert/strict');
const h3 = require('h3-js');
const { getNearby } = require('./nearbyService');
const core = require('./nearbyCore');
const { parseGeoapifyFeatures, parseOverpassElements, overpassQuery } = require('./providers');

const NOW = new Date('2026-10-06T10:00:00Z');
const LAT = 19.0178;
const LNG = 72.8478;

const place = (id, type, dLat, dLng, extra = {}) => ({ id, type, name: id, lat: LAT + dLat, lng: LNG + dLng, phone: null, address: null, openingHours: null, ...extra });

function makeDeps({ providerResults = [], cacheDocs = [], seed = [] } = {}) {
  const saved = [];
  const calls = [];
  const provs = providerResults.map((r, i) => ({
    name: r.name,
    available: () => r.available !== false,
    async fetch(args) {
      calls.push({ provider: r.name, ...args });
      if (r.error) throw new Error(r.error);
      return { places: r.places || [], coverageRadiusMeters: r.coverage ?? Infinity };
    },
  }));
  return {
    saved,
    calls,
    providers: provs,
    cache: {
      async load() { return new Map(cacheDocs.map((d) => [d.cell, d])); },
      async save(entries) { saved.push(...entries); },
    },
    seed: { async find(cells) { return seed.filter((p) => cells.includes(p.h3Index)); } },
  };
}
const params = { lat: LAT, lng: LNG, radius: 1500, now: NOW };

// ── fallback order ──────────────────────────────────────────────────────────

test('fallback order 1: Geoapify answers, Overpass is never called, results are cached per cell', async () => {
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', places: [place('g1', 'hospital', 0.002, 0)] }, { name: 'overpass', places: [] }] });
  const r = await getNearby(params, deps);
  assert.equal(r.status, 'ok');
  assert.equal(r.source, 'geoapify');
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].provider, 'geoapify');
  assert.equal(deps.saved.length, r.cells.total); // every cell cached, empty ones too
  assert.equal(r.data.length, 1);
});

test('fallback order 2: no Geoapify key -> Overpass, and the skipped provider is recorded', async () => {
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', available: false }, { name: 'overpass', places: [place('o1', 'police', 0.001, 0.001)] }] });
  const r = await getNearby(params, deps);
  assert.equal(r.source, 'overpass');
  assert.deepEqual(deps.calls.map((c) => c.provider), ['overpass']);
  assert.match(r.attempts[0].outcome, /skipped/);
});

test('fallback order 3: Geoapify error/timeout -> Overpass', async () => {
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', error: 'timeout of 10000ms exceeded' }, { name: 'overpass', places: [place('o1', 'police', 0.001, 0.001)] }] });
  const r = await getNearby(params, deps);
  assert.equal(r.source, 'overpass');
  assert.deepEqual(deps.calls.map((c) => c.provider), ['geoapify', 'overpass']);
});

test('fallback order 4: both fail -> stale cache (flagged stale) AND seed for cells that have no cache at all', async () => {
  const userCell = h3.latLngToCell(LAT, LNG, 8);
  const [ulat, ulng] = h3.cellToLatLng(userCell);
  const staleDoc = {
    cell: userCell,
    source: 'geoapify',
    fetchedAt: new Date(NOW.getTime() - 3 * 24 * 3600 * 1000),
    places: [{ id: 's1', type: 'hospital', name: 'Stale Hospital', lat: ulat, lng: ulng, phone: '123', address: null, openingHours: null }],
  };
  const neighbour = h3.gridDisk(userCell, 1).find((c) => c !== userCell);
  const [nlat, nlng] = h3.cellToLatLng(neighbour);
  const seed = [{ id: 'seed:police:1', type: 'police', name: null, lat: nlat, lng: nlng, h3Index: neighbour }];
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', error: 'down' }, { name: 'overpass', error: 'down' }], cacheDocs: [staleDoc], seed });

  const r = await getNearby({ ...params, radius: 2000 }, deps);
  assert.equal(r.stale, true);
  assert.equal(r.status, 'partial');
  assert.equal(r.source, 'mixed');
  const stale = r.data.find((d) => d.id === 's1');
  const seeded = r.data.find((d) => d.id === 'seed:police:1');
  assert.equal(stale.source, 'geoapify'); // served from the expired cache, labelled with its real source
  assert.equal(stale.phone, '123');
  assert.equal(seeded.source, 'seed');
  assert.equal(r.cells.stale, 1);
  assert.equal(r.cells.seed, 1);
  assert.equal(r.cachedAt, staleDoc.fetchedAt.toISOString());
});

test('fallback order 5: seed only, labelled source "seed", no phone, openNow null', async () => {
  const cells = core.cellsForRadius(LAT, LNG, 1500);
  const seed = cells.slice(0, 3).map((c, i) => { const [la, ln] = h3.cellToLatLng(c); return { id: `seed:hospital:${i}`, type: 'hospital', name: null, lat: la, lng: ln, h3Index: c }; });
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', error: 'x' }, { name: 'overpass', error: 'y' }], seed });
  const r = await getNearby(params, deps);
  assert.equal(r.status, 'seed');
  assert.equal(r.source, 'seed');
  assert.equal(r.stale, true);
  assert.ok(r.data.every((d) => d.source === 'seed' && d.phone === null && d.openNow === null && d.fetchedAt === null));
});

test('fallback order 6: everything fails and nothing cached -> empty list, status "unavailable" (no fake places)', async () => {
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', error: 'x' }, { name: 'overpass', error: 'y' }] });
  const r = await getNearby(params, deps);
  assert.equal(r.status, 'unavailable');
  assert.deepEqual(r.data, []);
  assert.equal(r.count, 0);
  assert.equal(r.source, null);
});

test('a provider that succeeds with ZERO places is a valid empty answer, not a failure (seed is not used)', async () => {
  const cells = core.cellsForRadius(LAT, LNG, 1500);
  const [la, ln] = h3.cellToLatLng(cells[0]);
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', places: [] }], seed: [{ id: 's', type: 'hospital', lat: la, lng: ln, h3Index: cells[0] }] });
  const r = await getNearby(params, deps);
  assert.equal(r.status, 'ok');
  assert.equal(r.count, 0);
});

// ── cache merge ─────────────────────────────────────────────────────────────

test('cache merge: fresh cells are served from cache and ONLY the missing cells are fetched', async () => {
  const cells = core.cellsForRadius(LAT, LNG, 3000);
  const freshCells = cells.slice(0, cells.length - 6);
  const missing = cells.slice(cells.length - 6);
  const freshDocs = freshCells.map((cell) => ({ cell, source: 'geoapify', fetchedAt: new Date(NOW.getTime() - 3600 * 1000), places: [] }));
  // one cached hospital right next to the user
  const userCell = h3.latLngToCell(LAT, LNG, 8);
  const userDoc = freshDocs.find((d) => d.cell === userCell);
  if (userDoc) userDoc.places = [place('cached-1', 'hospital', 0.0005, 0)];

  const deps = makeDeps({ cacheDocs: freshDocs, providerResults: [{ name: 'geoapify', places: [place('new-1', 'police', 0.004, 0.004)] }] });
  const r = await getNearby({ ...params, radius: 3000 }, deps);

  assert.equal(deps.calls.length, 1);
  // the fetched bounding box covers every missing cell...
  const bbox = deps.calls[0].bbox;
  for (const c of missing) for (const [la, ln] of h3.cellToBoundary(c)) {
    assert.ok(la >= bbox.minLat - 1e-9 && la <= bbox.maxLat + 1e-9 && ln >= bbox.minLng - 1e-9 && ln <= bbox.maxLng + 1e-9);
  }
  // ...and only missing cells were written back
  assert.deepEqual(deps.saved.map((s) => s.cell).sort(), missing.slice().sort());
  assert.equal(r.cells.cached, freshCells.length);
  assert.equal(r.cells.fetched, missing.length);
  if (userDoc) assert.ok(r.data.some((d) => d.id === 'cached-1'));
});

test('cache merge: a fully fresh cache makes zero provider calls', async () => {
  const cells = core.cellsForRadius(LAT, LNG, 1500);
  const docs = cells.map((cell) => ({ cell, source: 'overpass', fetchedAt: new Date(NOW.getTime() - 5 * 3600 * 1000), places: [] }));
  const deps = makeDeps({ cacheDocs: docs, providerResults: [{ name: 'geoapify', places: [] }] });
  const r = await getNearby(params, deps);
  assert.equal(deps.calls.length, 0);
  assert.equal(r.status, 'ok');
  assert.equal(r.source, 'overpass'); // no places in range: the source is taken from the cache entries used
  assert.equal(r.cachedAt, docs[0].fetchedAt.toISOString());
});

test('cache merge: entries older than 24 h count as missing and are refreshed', async () => {
  const cells = core.cellsForRadius(LAT, LNG, 1500);
  const docs = cells.map((cell) => ({ cell, source: 'geoapify', fetchedAt: new Date(NOW.getTime() - 25 * 3600 * 1000), places: [] }));
  const deps = makeDeps({ cacheDocs: docs, providerResults: [{ name: 'geoapify', places: [] }] });
  await getNearby(params, deps);
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.saved.length, cells.length);
});

test('truncated provider answer: only cells fully inside the covered distance are cached; the rest stay missing', async () => {
  const deps = makeDeps({ providerResults: [{ name: 'geoapify', places: [place('n1', 'pharmacy', 0.001, 0)], coverage: 900 }] });
  const r = await getNearby({ ...params, radius: 3000 }, deps);
  assert.ok(deps.saved.length > 0 && deps.saved.length < r.cells.total);
  assert.equal(r.cells.unavailable, r.cells.total - deps.saved.length);
  assert.equal(r.status, 'partial');
});

// ── distance sort, radius, types ────────────────────────────────────────────

test('results are sorted nearest first, filtered by radius and by requested types', async () => {
  const items = [
    { place: place('far', 'hospital', 0.02, 0), source: 'geoapify', fetchedAt: NOW },
    { place: place('near', 'hospital', 0.001, 0), source: 'geoapify', fetchedAt: NOW },
    { place: place('mid', 'police', 0.005, 0), source: 'geoapify', fetchedAt: NOW },
    { place: place('pharm', 'pharmacy', 0.0001, 0), source: 'geoapify', fetchedAt: NOW },
  ];
  const all = core.shapePlaces(items, { lat: LAT, lng: LNG, radius: 3000, types: ['hospital', 'police', 'pharmacy'], limit: 10, now: NOW });
  assert.deepEqual(all.map((r) => r.id), ['pharm', 'near', 'mid', 'far']); // far is ~2.2 km, inside 3 km
  const hospitalsOnly = core.shapePlaces(items, { lat: LAT, lng: LNG, radius: 5000, types: ['hospital'], limit: 10, now: NOW });
  assert.deepEqual(hospitalsOnly.map((r) => r.id), ['near', 'far']);
  const tight = core.shapePlaces(items, { lat: LAT, lng: LNG, radius: 1000, types: ['hospital', 'police', 'pharmacy'], limit: 10, now: NOW });
  assert.deepEqual(tight.map((r) => r.id), ['pharm', 'near', 'mid']); // 'far' (~2.2 km) is outside a 1 km radius
  assert.ok(hospitalsOnly[0].distance < hospitalsOnly[1].distance);
  assert.equal(core.shapePlaces(items, { lat: LAT, lng: LNG, radius: 5000, types: ['hospital'], limit: 1, now: NOW }).length, 1);
});

test('duplicates collapse, openNow comes from opening_hours (null when unknown or absent)', async () => {
  const a = place('dup', 'hospital', 0.001, 0, { openingHours: '24/7' });
  const rows = core.shapePlaces(
    [
      { place: a, source: 'geoapify', fetchedAt: NOW },
      { place: a, source: 'geoapify', fetchedAt: NOW },
      { place: place('unk', 'hospital', 0.002, 0, { openingHours: 'by appointment' }), source: 'geoapify', fetchedAt: NOW },
      { place: place('none', 'hospital', 0.003, 0), source: 'geoapify', fetchedAt: NOW },
    ],
    { lat: LAT, lng: LNG, radius: 3000, types: ['hospital'], limit: 10, now: NOW }
  );
  assert.deepEqual(rows.map((r) => [r.id, r.openNow]), [['dup', true], ['unk', null], ['none', null]]);
});

// ── cells / parsers ─────────────────────────────────────────────────────────

test('cellsForRadius grows with the radius and always includes the user cell', () => {
  const small = core.cellsForRadius(LAT, LNG, 500);
  const big = core.cellsForRadius(LAT, LNG, 3000);
  assert.ok(big.length > small.length * 4);
  assert.ok(small.includes(h3.latLngToCell(LAT, LNG, 8)));
  assert.ok(core.cellsForRadius(LAT, LNG, 10000).length < 800);
});

test('Geoapify and Overpass responses are normalised; missing fields stay null', () => {
  const g = parseGeoapifyFeatures(
    [
      { properties: { place_id: 'abc', name: 'City Hospital', lat: 19.01, lon: 72.84, formatted: 'City Hospital, Dadar', address_line2: 'Dadar, Mumbai', contact: { phone: '+912212345678' }, opening_hours: '24/7' } },
      { properties: { place_id: 'def', lat: 19.02, lon: 72.85 } },
      { properties: { place_id: 'bad' } },
    ],
    'hospital'
  );
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].name, g[0].phone, g[0].openingHours, g[0].address], ['City Hospital', '+912212345678', '24/7', 'Dadar, Mumbai']);
  assert.deepEqual([g[1].name, g[1].phone, g[1].openingHours], [null, null, null]);

  const o = parseOverpassElements([
    { type: 'node', id: 1, lat: 19.0, lon: 72.8, tags: { amenity: 'pharmacy', name: 'Apollo', phone: '123', opening_hours: 'Mo-Su 09:00-21:00' } },
    { type: 'way', id: 2, center: { lat: 19.1, lon: 72.9 }, tags: { amenity: 'police' } },
    { type: 'node', id: 3, lat: 19.2, lon: 72.9, tags: { amenity: 'cafe' } },
  ]);
  assert.deepEqual(o.map((p) => [p.id, p.type, p.name]), [['overpass:node/1', 'pharmacy', 'Apollo'], ['overpass:way/2', 'police', null]]);
  assert.match(overpassQuery({ minLat: 1, minLng: 2, maxLat: 3, maxLng: 4 }), /\(1,2,3,4\)/);
});
