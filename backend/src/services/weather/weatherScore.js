const wcfg = require('../../config/weather.config');
const { haversineMeters } = require('../../config/region.config');

/**
 * Weather scoring (pure).
 *  scoreObservation(obs): rain intensity, visibility, wind/gust, heat/cold and thunderstorm
 *    condition -> 0..100 with the individual factor scores and reasons.
 *  interpolateScore(samples, point): inverse-distance weighting of the nearest sample points.
 */

/** Piecewise-linear lookup on [[x, y], ...] (any x order), clamped at both ends. */
function curve(points, x) {
  const pts = [...points].sort((a, b) => a[0] - b[0]);
  if (x <= pts[0][0]) return pts[0][1];
  if (x >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i += 1) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return 0;
}

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * @param {Object} obs { rainMmPerHour, visibility (m), windSpeed (m/s), windGust, feelsLike (C),
 *                       temperature (C), weatherId }
 * A field that is null/undefined is skipped (unknown), never treated as "perfect conditions".
 * The one exception is rain: OpenWeather omits the rain object when it is not raining, so the caller
 * passes rainMmPerHour = 0 for a successful observation without rain.
 */
function scoreObservation(obs, cfg = wcfg) {
  const factors = {};
  const reasons = [];

  const rain = num(obs.rainMmPerHour);
  if (rain !== null) {
    factors.rain = curve(cfg.curves.rainMmPerHour, rain);
    if (factors.rain >= 20) reasons.push(`rain ${rain.toFixed(1)} mm/h`);
  }

  const visibility = num(obs.visibility);
  if (visibility !== null) {
    factors.visibility = curve(cfg.curves.visibilityMeters, visibility);
    if (factors.visibility >= 30) reasons.push(`visibility ${Math.round(visibility)} m`);
  }

  const wind = Math.max(num(obs.windSpeed) ?? 0, num(obs.windGust) ?? 0);
  if (num(obs.windSpeed) !== null || num(obs.windGust) !== null) {
    factors.wind = curve(cfg.curves.windMs, wind);
    if (factors.wind >= 20) reasons.push(`wind ${wind.toFixed(0)} m/s`);
  }

  const feels = num(obs.feelsLike) ?? num(obs.temperature);
  if (feels !== null) {
    factors.temperature = Math.max(curve(cfg.curves.heatFeelsLikeC, feels), curve(cfg.curves.coldFeelsLikeC, feels));
    if (factors.temperature >= 25) reasons.push(`feels like ${feels.toFixed(0)} C`);
  }

  const sorted = Object.values(factors).sort((a, b) => b - a);
  let score = sorted.length ? Math.min(100, sorted[0] + cfg.compoundWeight * (sorted[1] || 0)) : null;

  const floor = cfg.conditionFloors[Number(obs.weatherId)];
  if (floor !== undefined) {
    factors.condition = floor;
    reasons.push(`severe condition (${obs.weatherId})`);
    score = Math.max(score ?? 0, floor);
  }

  return { score: score === null ? null : Math.round(score * 10) / 10, factors, reasons };
}

/**
 * Inverse-distance weighting over the `neighbours` nearest usable samples within maxDistanceMeters.
 * @param {Array<{lat:number,lng:number,score:number}>} samples
 * @returns {number|null} null when no sample is in range
 */
function interpolateScore(samples, point, cfg = wcfg) {
  const { neighbours, power, maxDistanceMeters } = cfg.interpolation;
  const ranked = samples
    .map((s) => ({ s, d: haversineMeters(point.lat, point.lng, s.lat, s.lng) }))
    .filter((x) => x.d <= maxDistanceMeters)
    .sort((a, b) => a.d - b.d)
    .slice(0, neighbours);
  if (ranked.length === 0) return null;
  if (ranked[0].d < 1) return ranked[0].s.score;

  let num_ = 0;
  let den = 0;
  for (const { s, d } of ranked) {
    const w = 1 / Math.pow(d, power);
    num_ += w * s.score;
    den += w;
  }
  return Math.round((num_ / den) * 10) / 10;
}

/** Optional flood-prone boost (see weather.config.js). Only meaningful when real data was provided. */
function applyFloodBoost(score, rainScore, cfg = wcfg) {
  if (score === null || rainScore === null || rainScore < cfg.floodProne.minRainScore) return score;
  return Math.min(100, Math.round((score + (cfg.floodProne.boostPoints * rainScore) / 100) * 10) / 10);
}

module.exports = { curve, scoreObservation, interpolateScore, applyFloodBoost };
