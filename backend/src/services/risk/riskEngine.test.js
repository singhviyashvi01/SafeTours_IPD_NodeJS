const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, timeModifier } = require('./riskEngine');

// 2026-10-03 06:30 UTC = 12:00 IST (daytime; no festival in config for this date)
const NOON_IST = new Date('2026-10-03T06:30:00Z');
// 2026-10-03 18:30 UTC = 00:00 IST (night band wraps past midnight)
const NIGHT_IST = new Date('2026-10-03T18:30:00Z');

const minutesAgo = (m, now = NOON_IST) => new Date(now.getTime() - m * 60000).toISOString();
const fresh = (score, now = NOON_IST) => ({ score, updatedAt: minutesAgo(5, now) });
const feeds = (now = NOON_IST) => ({
  news: { updatedAt: minutesAgo(5, now) },
  community: { updatedAt: minutesAgo(5, now) },
});

test('no data at all is UNKNOWN, never SAFE', () => {
  const r = evaluate({ components: {}, feeds: {}, now: NOON_IST });
  assert.equal(r.level, 'UNKNOWN');
  assert.equal(r.totalRisk, null);
  assert.equal(r.dataConfidence, 0);
  assert.deepEqual([...r.missing].sort(), ['community', 'crime', 'crowd', 'news', 'weather']);
});

test('all five components present: plain weighted mean', () => {
  const r = evaluate({
    components: { crime: fresh(80), weather: fresh(20), crowd: fresh(40) },
    feeds: feeds(),
    now: NOON_IST,
  });
  // community & news default to 0 while their feeds are fresh
  // .4*80 + .2*20 + .15*40 = 42
  assert.equal(r.baseRisk, 42);
  assert.equal(r.totalRisk, 42);
  assert.equal(r.dataConfidence, 1);
  assert.equal(r.confidenceLabel, 'HIGH');
  assert.equal(r.lowConfidence, false);
  assert.equal(r.level, 'MODERATE');
  assert.equal(r.topFactor, 'crime');
});

test('missing crime: weights renormalised, confidence lowered, lowConfidence flagged', () => {
  const r = evaluate({
    components: { weather: fresh(60), crowd: fresh(60) },
    feeds: feeds(),
    now: NOON_IST,
  });
  // usable weights .2 + .15 + .15 + .1 = .6 ; base = (.2*60 + .15*60) / .6 = 35
  assert.equal(r.baseRisk, 35);
  assert.equal(r.dataConfidence, 0.6);
  assert.equal(r.confidenceLabel, 'MEDIUM');
  assert.equal(r.lowConfidence, true);
  assert.ok(r.missing.includes('crime'));
  assert.ok(r.lowConfidenceReasons.includes('crime data unavailable'));
  assert.equal(r.breakdown.crime.score, null);
  assert.equal(r.level, 'LOW');
});

test('too little coverage yields UNKNOWN instead of an invented level', () => {
  const r = evaluate({ components: { weather: fresh(90) }, feeds: {}, now: NOON_IST });
  assert.equal(r.dataConfidence, 0.2);
  assert.equal(r.level, 'UNKNOWN');
  assert.equal(r.totalRisk, null);
  assert.equal(r.baseRisk, 90); // kept for debugging only
});

test('stale data is used at half weight and flagged; expired data is dropped', () => {
  const stale = { score: 50, updatedAt: minutesAgo(180) }; // weather ttl 90 -> stale (<= 360)
  const expired = { score: 50, updatedAt: minutesAgo(450) }; // beyond 4 x ttl
  const a = evaluate({ components: { crime: fresh(50), weather: stale }, feeds: feeds(), now: NOON_IST });
  assert.equal(a.breakdown.weather.status, 'stale');
  assert.equal(a.breakdown.weather.available, true);
  assert.deepEqual(a.stale, ['weather']);
  // crime .4 + weather .2/2 + community .15 + news .1 (crowd missing) = .75
  assert.equal(a.dataConfidence, 0.75);

  const b = evaluate({ components: { crime: fresh(50), weather: expired }, feeds: feeds(), now: NOON_IST });
  assert.equal(b.breakdown.weather.status, 'expired');
  assert.equal(b.breakdown.weather.score, null);
  assert.equal(b.breakdown.weather.lastKnownScore, 50);
  assert.ok(b.missing.includes('weather'));
});

test('a dead feed (old heartbeat) turns news into stale instead of silently 0', () => {
  const f = { news: { updatedAt: minutesAgo(360) }, community: { updatedAt: minutesAgo(5) } };
  const r = evaluate({
    components: { crime: fresh(10), weather: fresh(10), crowd: fresh(10) },
    feeds: f,
    now: NOON_IST,
  });
  assert.equal(r.breakdown.news.status, 'stale');
  assert.equal(r.dataConfidence, 0.95); // news counts at half weight
});

test('demo components are scored but count at reduced confidence and surface the flag', () => {
  const crime = { score: 70, updatedAt: minutesAgo(5), meta: { demo: true } };
  const r = evaluate({
    components: { crime, weather: fresh(10), crowd: fresh(10) },
    feeds: feeds(),
    now: NOON_IST,
  });
  assert.equal(r.demo, true);
  assert.equal(r.lowConfidence, true);
  assert.equal(r.dataConfidence, 0.8); // crime counts .2 instead of .4
  assert.ok(r.lowConfidenceReasons.includes('crime is demo data'));
});

test('night multiplies base risk by 1.2 and the result is clamped to 100', () => {
  const comps = (now, s) => ({
    crime: fresh(s, now),
    weather: fresh(s, now),
    crowd: fresh(s, now),
    community: { score: s },
    news: { score: s },
  });
  const day = evaluate({ components: comps(NOON_IST, 50), feeds: feeds(), now: NOON_IST });
  const night = evaluate({ components: comps(NIGHT_IST, 50), feeds: feeds(NIGHT_IST), now: NIGHT_IST });
  assert.equal(day.totalRisk, 50);
  assert.equal(night.modifiers.time.label, 'night');
  assert.equal(night.totalRisk, 60);

  const high = evaluate({ components: comps(NIGHT_IST, 90), feeds: feeds(NIGHT_IST), now: NIGHT_IST });
  assert.equal(high.totalRisk, 100); // 90 x 1.2 = 108 -> clamped
});

test('time modifier: wrap-around night band, evening band, festival boost', () => {
  assert.equal(timeModifier(new Date('2026-10-03T20:30:00Z')).time.label, 'night'); // 02:00 IST
  assert.equal(timeModifier(new Date('2026-10-03T06:30:00Z')).time.label, 'day'); // 12:00 IST
  assert.equal(timeModifier(new Date('2026-10-03T14:00:00Z')).time.label, 'evening'); // 19:30 IST
  const f = timeModifier(new Date('2026-11-08T06:30:00Z')); // Diwali, midday
  assert.equal(f.festival.name, 'Diwali');
  assert.equal(f.combinedMultiplier, 1.1);
});

test('level thresholds are 20 / 40 / 60 / 80', () => {
  const at = (s) =>
    evaluate({
      components: {
        crime: fresh(s),
        weather: fresh(s),
        crowd: fresh(s),
        community: { score: s },
        news: { score: s },
      },
      feeds: feeds(),
      now: NOON_IST,
    });
  const cases = [
    [0, 'SAFE'],
    [19.9, 'SAFE'],
    [20, 'LOW'],
    [39.9, 'LOW'],
    [40, 'MODERATE'],
    [59.9, 'MODERATE'],
    [60, 'HIGH'],
    [79.9, 'HIGH'],
    [80, 'EXTREME'],
    [100, 'EXTREME'],
  ];
  for (const [score, level] of cases) assert.equal(at(score).level, level, `score ${score}`);
});
