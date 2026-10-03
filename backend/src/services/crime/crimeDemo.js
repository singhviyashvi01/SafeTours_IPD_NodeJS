const { localities } = require('../../config/mumbaiGazetteer');
const { haversineMeters } = require('../../config/region.config');

/**
 * DEMO crime scores (USE_DEMO_CRIME_DATA=true). These are NOT real crime data and say nothing about
 * any real neighbourhood: every locality's intensity and spread is a deterministic pseudo-random value
 * derived from a hash of its name, and each cell adds hash-based noise. The point is only to give the
 * map varied, plausible-looking values for demos. Everything written from here is tagged
 * meta.source = 'demo' and meta.demo = true, and the API and UI label it "Demo data".
 */

// FNV-1a 32-bit hash -> float in [0, 1)
function hash01(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

// Share of cells per level: SAFE 55%, LOW 20%, MODERATE 15%, HIGH or worse 10%.
const SHARES = [0.55, 0.2, 0.15, 0.1];

function quantileToScore(p) {
  const edges = [0, 0.55, 0.75, 0.9, 1];
  const ranges = [[0, 19.9], [20, 39.9], [40, 59.9], [60, 100]];
  for (let i = 0; i < 4; i += 1) {
    if (p < edges[i + 1] || i === 3) {
      const t = (p - edges[i]) / (edges[i + 1] - edges[i]);
      return ranges[i][0] + (ranges[i][1] - ranges[i][0]) * Math.min(1, Math.max(0, t));
    }
  }
  return 0;
}

/**
 * @param {Array<{h3Index:string, center:{lat:number,lng:number}}>} cells
 * @returns {Object} { [h3Index]: 0..100 }
 */
function demoCrimeScores(cells, salt = 'safetours-demo-v1') {
  const anchors = localities.map((l) => ({
    lat: l.lat,
    lng: l.lng,
    intensity: 0.25 + 0.75 * hash01(`${salt}:i:${l.name}`),
    sigma: 900 + 1600 * hash01(`${salt}:s:${l.name}`), // metres
  }));

  const raw = cells.map((c) => {
    let v = 0;
    for (const a of anchors) {
      const d = haversineMeters(c.center.lat, c.center.lng, a.lat, a.lng);
      v += a.intensity * Math.exp(-((d / a.sigma) ** 2));
    }
    return v * (0.85 + 0.3 * hash01(`${salt}:c:${c.h3Index}`));
  });

  // Rank-based quantile map, so the SCORE distribution is fixed by construction (target shares of the
  // grid per level) while the spatial pattern still comes from the anchors above.
  const order = raw.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const scores = {};
  order.forEach(([, idx], rank) => {
    const p = order.length > 1 ? rank / (order.length - 1) : 0;
    scores[cells[idx].h3Index] = Math.round(quantileToScore(p) * 10) / 10;
  });
  return scores;
}

module.exports = { demoCrimeScores, hash01, quantileToScore, SHARES };
