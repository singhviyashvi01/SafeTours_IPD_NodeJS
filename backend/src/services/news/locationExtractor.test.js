const test = require('node:test');
const assert = require('node:assert/strict');
const { extractGazetteerLocations, extractCandidates } = require('./locationExtractor');

const names = (t) => extractGazetteerLocations(t).map((l) => l.name);

test('gazetteer finds localities and aliases, whole words only', () => {
  assert.deepEqual(names('Fire at Andheri East warehouse'), ['Andheri']);
  assert.deepEqual(names('Delay at CST after signal failure'), ['CSMT']);
  assert.deepEqual(names('Waterlogging near Santa Cruz and Vile Parle'), ['Santacruz', 'Vile Parle']);
  assert.deepEqual(names('Mission statement of the mission'), []); // "Sion" inside "Mission" is not a match
});

test('longest alias wins: Lower Parel is not also Parel', () => {
  assert.deepEqual(names('Fire in Lower Parel mill compound'), ['Lower Parel']);
});

test('"Mumbai" alone and generic words are not locations', () => {
  assert.deepEqual(names('Heavy rain lashes Mumbai'), []);
  assert.deepEqual(extractCandidates('Heavy rain lashes Mumbai on Monday in Maharashtra'), []);
});

test('ambiguous short aliases are case-sensitive ("fort" the building vs Fort the area)', () => {
  assert.deepEqual(names('Tourists visit an old fort near the coast'), []);
  assert.deepEqual(names('Crowd gathers at Fort ahead of the march'), ['Fort']);
});

test('candidates: places the gazetteer does not know, from context patterns', () => {
  assert.deepEqual(extractCandidates('Fire broke out near Antop Hill on Tuesday'), ['Antop Hill']);
  assert.deepEqual(extractCandidates('Truck overturns at Dahanu Naka flyover'), ['Dahanu Naka']);
  // already in the gazetteer -> not a candidate
  assert.deepEqual(extractCandidates('Accident in Andheri'), []);
});
