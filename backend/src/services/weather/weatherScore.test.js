const test = require('node:test');
const assert = require('node:assert/strict');
const { curve, scoreObservation, interpolateScore, applyFloodBoost } = require('./weatherScore');

const calm = { rainMmPerHour: 0, visibility: 10000, windSpeed: 3, windGust: 4, feelsLike: 30, temperature: 29, weatherId: 800 };

test('curve interpolates linearly and clamps', () => {
  const pts = [[0, 0], [10, 100]];
  assert.equal(curve(pts, -5), 0);
  assert.equal(curve(pts, 5), 50);
  assert.equal(curve(pts, 99), 100);
  // descending-by-value curves (visibility) work regardless of input order
  assert.equal(curve([[200, 100], [10000, 0]], 10000), 0);
});

test('calm clear weather scores 0', () => {
  assert.equal(scoreObservation(calm).score, 0);
});

test('rain intensity drives the score (drizzle < moderate < very heavy)', () => {
  const s = (rain) => scoreObservation({ ...calm, rainMmPerHour: rain }).score;
  assert.ok(s(0.3) < s(5));
  assert.ok(s(5) < s(20));
  assert.ok(s(20) >= 65);
  assert.ok(s(80) === 100);
});

test('low visibility, strong wind and extreme heat each raise the score', () => {
  assert.ok(scoreObservation({ ...calm, visibility: 400 }).score >= 75);
  assert.ok(scoreObservation({ ...calm, windGust: 22 }).score >= 60);
  assert.ok(scoreObservation({ ...calm, feelsLike: 44 }).score >= 80);
  assert.ok(scoreObservation({ ...calm, feelsLike: 2 }).score >= 30);
});

test('hazards compound: heavy rain plus poor visibility beats rain alone', () => {
  const rainOnly = scoreObservation({ ...calm, rainMmPerHour: 20 }).score;
  const both = scoreObservation({ ...calm, rainMmPerHour: 20, visibility: 800 }).score;
  assert.ok(both > rainOnly);
  assert.ok(both <= 100);
});

test('thunderstorm / tornado conditions set a floor even with mild measurements', () => {
  assert.ok(scoreObservation({ ...calm, weatherId: 211 }).score >= 65);
  assert.equal(scoreObservation({ ...calm, weatherId: 781 }).score, 100);
});

test('unknown fields are skipped, never treated as perfect weather', () => {
  const r = scoreObservation({ rainMmPerHour: 20 });
  assert.equal(Object.keys(r.factors).join(), 'rain');
  assert.equal(scoreObservation({}).score, null);
});

test('interpolation: exact at a sample, in between for two samples, null out of range', () => {
  const samples = [
    { lat: 19.0, lng: 72.8, score: 80 },
    { lat: 19.0, lng: 72.9, score: 20 },
  ];
  assert.equal(interpolateScore(samples, { lat: 19.0, lng: 72.8 }), 80);
  const mid = interpolateScore(samples, { lat: 19.0, lng: 72.85 });
  assert.ok(mid > 20 && mid < 80);
  const nearFirst = interpolateScore(samples, { lat: 19.0, lng: 72.81 });
  assert.ok(nearFirst > mid);
  assert.equal(interpolateScore(samples, { lat: 20.5, lng: 72.8 }), null);
});

test('flood boost only applies with enough rain, and never exceeds 100', () => {
  assert.equal(applyFloodBoost(30, 10), 30);
  assert.ok(applyFloodBoost(60, 80) > 60);
  assert.equal(applyFloodBoost(98, 100), 100);
  assert.equal(applyFloodBoost(null, 80), null);
});
