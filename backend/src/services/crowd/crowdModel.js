const h3 = require('h3-js');
const crowdCfg = require('../../config/crowd.config');
const riskCfg = require('../../config/risk.config');
const { localTime } = require('../risk/riskEngine');

/**
 * Crowd model (pure). Two stages so the hourly recompute needs no API call:
 *   1. buildPotentials(places): per H3 cell, crowd units by time profile (static until places change)
 *   2. crowdScore(potential, now): applies the IST time profile, weekday/weekend and festival
 */

const H3_RES = 9;

function bandMultiplier(bands, hour) {
  const band = bands.find(([from, to]) => hour >= from && hour < to);
  return band ? band[2] : 0;
}

function profileMultiplier(profile, hour, weekend, cfg = crowdCfg) {
  const def = cfg.profiles[profile];
  if (!def) return 0;
  return bandMultiplier(weekend ? def.weekend : def.weekday, hour);
}

function categoryByKey(key, cfg = crowdCfg) {
  return cfg.categories.find((c) => c.key === key);
}

/**
 * @param {Array<{name?:string, lat:number, lon:number, key:string}>} places  key = categories[].key
 * @returns {Map<string, {byProfile:Object, poiCount:number, topPlaces:string[]}>}
 */
function buildPotentials(places, cfg = crowdCfg) {
  const out = new Map();
  const ensure = (cell) => {
    if (!out.has(cell)) out.set(cell, { byProfile: {}, poiCount: 0, topPlaces: [], _w: [] });
    return out.get(cell);
  };

  for (const place of places) {
    const cat = categoryByKey(place.key, cfg);
    if (!cat || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) continue;
    const cell = h3.latLngToCell(place.lat, place.lon, H3_RES);

    h3.gridDiskDistances(cell, cfg.spread.maxRing).forEach((ring, k) => {
      const w = cat.weight * Math.pow(cfg.spread.decayPerRing, k);
      for (const c of ring) {
        const p = ensure(c);
        p.byProfile[cat.profile] = (p.byProfile[cat.profile] || 0) + w;
      }
    });

    const own = ensure(cell);
    own.poiCount += 1;
    own._w.push([cat.weight, place.name || cat.key]);
  }

  for (const p of out.values()) {
    p.topPlaces = p._w.sort((a, b) => b[0] - a[0]).slice(0, 3).map((x) => x[1]);
    delete p._w;
  }
  return out;
}

/** 0..100 crowd score of a cell at `now` (IST rules). */
function crowdScore(byProfile, { now = new Date(), cfg = crowdCfg, risk = riskCfg } = {}) {
  const { date, hour } = localTime(now, risk.timezone);
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 Sunday .. 6 Saturday
  const weekend = day === 0 || day === 6;

  let raw = 0;
  for (const [profile, units] of Object.entries(byProfile || {})) {
    raw += units * profileMultiplier(profile, hour, weekend, cfg);
  }

  const festival = risk.festivals
    .filter((f) => date >= f.start && date <= f.end)
    .sort((a, b) => b.crowdBonus - a.crowdBonus)[0];
  const festivalMult = festival ? 1 + festival.crowdBonus / 100 : 1;

  const score = 100 * (1 - Math.exp(-(raw * festivalMult) / cfg.saturation));
  return {
    score: Math.round(score * 10) / 10,
    localHour: hour,
    weekend,
    festival: festival ? festival.name : null,
  };
}

module.exports = { buildPotentials, crowdScore, profileMultiplier, categoryByKey };
