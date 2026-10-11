const h3 = require('h3-js');
const cfg = require('../../config/assistant.config');
const { sanitizeUntrusted } = require('./sanitize');

/**
 * Builds what the assistant is allowed to know, from the same sources the app uses:
 *   location + H3 cell, risk breakdown (top factor, confidence, demo flags), weather, nearest hospitals /
 *   police (getNearbyForContext), the active journey and its ETA, nearby community incidents, and the
 *   connectivity state the client reported.
 *
 * Output { ctx, untrusted, unavailable }:
 *   ctx        trusted structured values (numbers, enums, place names cleaned and shortened). Same shape as the
 *              context of shared/assistantRules.js so the rule-based fallback can use it directly.
 *   untrusted  free text written by other people (incident descriptions): sanitised, truncated, and kept apart
 *              so the prompt can present it as quoted data.
 *   unavailable names of the parts that failed (they are reported to the model and in the answer's caveats)
 *
 * Every part is independent: one failing or slow source never fails the others.
 */

const withTimeout = (promise, ms, label) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))]);

const onlyPhone = (p) => {
  const s = String(p || '').replace(/[^\d+\-() ]/g, '').trim();
  return s.length >= 5 ? s.slice(0, 20) : null;
};

function defaultDeps() {
  const cellRisk = require('../risk/cellRisk.service');
  const weather = require('../weather/weather.service');
  const nearby = require('../nearby/nearbyService');
  const Journey = require('../../models/Journey');
  const Incident = require('../../models/Incident');
  return {
    risk: (lat, lng, now) => cellRisk.getRiskAt(lat, lng, { now }),
    weather: (lat, lng) => weather.getCurrentWeather(lat, lng),
    nearby: (lat, lng) =>
      nearby.getNearbyForContext(lat, lng, { radius: cfg.context.nearbyRadiusM, perType: 2, types: ['hospital', 'police', 'pharmacy', 'fire_station'] }),
    journey: (userId) => Journey.findOne({ userId, status: 'ACTIVE' }).select('expectedArrivalTime').lean(),
    incidents: (lat, lng, now) =>
      Incident.find({
        status: 'ACTIVE',
        expiresAt: { $gt: now },
        location: { $near: { $geometry: { type: 'Point', coordinates: [lng, lat] }, $maxDistance: cfg.context.communityRadiusM } },
      })
        .limit(cfg.context.maxIncidents)
        .select('incidentType description createdAt confirmationCount falseReportCount latitude longitude')
        .lean(),
  };
}

const distanceMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(toRad(lat2 - lat1) / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lon2 - lon1) / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * @param {{userId:any, location:{latitude:number, longitude:number, accuracy?:number}|null, connectivity?:string, now?:Date}} input
 * @param {Object} [deps] injected in tests
 */
async function buildContext({ userId, location, connectivity = null, now = new Date() }, deps = defaultDeps()) {
  const unavailable = [];
  const ctx = { source: 'server', connectivity: connectivity || null, now: now.toISOString(), location: null, risk: null, weather: null, nearby: null, journey: null, community: null };
  const untrusted = { communityNotes: [] };

  const hasFix = location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude));
  if (!hasFix) {
    unavailable.push('location');
    // The journey does not need a position.
    await journeyPart(ctx, userId, deps, now, unavailable);
    return { ctx, untrusted, unavailable };
  }

  const lat = Number(location.latitude);
  const lng = Number(location.longitude);
  ctx.location = {
    latitude: Math.round(lat * 1e5) / 1e5,
    longitude: Math.round(lng * 1e5) / 1e5,
    accuracy: location.accuracy !== null && location.accuracy !== undefined && Number.isFinite(Number(location.accuracy)) ? Math.round(Number(location.accuracy)) : null,
    h3Index: h3.latLngToCell(lat, lng, 9),
  };
  const t = cfg.context.perPartTimeoutMs;

  await Promise.all([
    (async () => {
      try {
        const r = await withTimeout(Promise.resolve(deps.risk(lat, lng, now)), t, 'risk');
        ctx.risk = {
          level: r.riskLevel,
          score: r.totalRiskScore,
          topFactor: r.topFactor,
          dataConfidence: r.dataConfidence,
          confidenceLabel: r.confidenceLabel,
          demo: Boolean(r.demo),
          lowConfidence: Boolean(r.lowConfidence),
          reasons: (r.lowConfidenceReasons || []).map((x) => sanitizeUntrusted(x, 80)),
          notes: (r.notes || []).map((x) => sanitizeUntrusted(x, 140)),
          missing: r.missing || [],
          stale: r.stale || [],
          breakdown: r.breakdown || {},
          modifiers: r.modifiers ? { time: r.modifiers.time, festival: r.modifiers.festival || null } : null,
        };
      } catch (e) {
        unavailable.push('risk');
      }
    })(),
    (async () => {
      try {
        const w = await withTimeout(Promise.resolve(deps.weather(lat, lng)), t, 'weather');
        ctx.weather = {
          temperature: w.temperature ?? null,
          description: w.weatherDescription ? sanitizeUntrusted(w.weatherDescription, 40) : null,
          rainMmPerHour: w.rainMmPerHour ?? null,
          humidity: w.humidity ?? null,
          stale: Boolean(w.stale),
        };
      } catch (e) {
        unavailable.push('weather');
      }
    })(),
    (async () => {
      try {
        const n = await withTimeout(Promise.resolve(deps.nearby(lat, lng)), t, 'nearby');
        if (n.status === 'unavailable') throw new Error('unavailable');
        const nearest = {};
        for (const [type, list] of Object.entries(n.nearest || {})) {
          nearest[type] = list.map((p) => ({
            name: p.name ? sanitizeUntrusted(p.name, 60) : null, // place names come from third parties: treat as untrusted
            distance: Number.isFinite(p.distance) ? Math.round(p.distance) : null,
            phone: onlyPhone(p.phone),
            openNow: typeof p.openNow === 'boolean' ? p.openNow : null,
          }));
        }
        ctx.nearby = { status: n.status, stale: Boolean(n.stale), source: n.source || null, nearest };
      } catch (e) {
        unavailable.push('nearby');
      }
    })(),
    (async () => {
      try {
        const rows = await withTimeout(Promise.resolve(deps.incidents(lat, lng, now)), t, 'community');
        const items = (rows || []).map((i) => ({
          type: i.incidentType,
          ageMinutes: Math.max(0, Math.round((now.getTime() - new Date(i.createdAt).getTime()) / 60000)),
          distanceM: Number.isFinite(i.latitude) && Number.isFinite(i.longitude) ? Math.round(distanceMeters(lat, lng, i.latitude, i.longitude)) : null,
          confirmations: i.confirmationCount || 0,
          falseReports: i.falseReportCount || 0,
        }));
        ctx.community = { count: items.length, radiusM: cfg.context.communityRadiusM, items };
        untrusted.communityNotes = (rows || []).map((i, idx) => ({ n: idx + 1, type: i.incidentType, text: sanitizeUntrusted(i.description, cfg.context.incidentTextChars) }));
      } catch (e) {
        unavailable.push('community');
      }
    })(),
    journeyPart(ctx, userId, deps, now, unavailable),
  ]);

  return { ctx, untrusted, unavailable };
}

async function journeyPart(ctx, userId, deps, now, unavailable) {
  try {
    const j = await withTimeout(Promise.resolve(deps.journey(userId)), cfg.context.perPartTimeoutMs, 'journey');
    if (!j) {
      ctx.journey = { active: false };
      return;
    }
    const minutes = Math.round((new Date(j.expectedArrivalTime).getTime() - now.getTime()) / 60000);
    ctx.journey = { active: true, etaMinutes: minutes, overdue: minutes < 0 };
  } catch (e) {
    unavailable.push('journey');
  }
}

module.exports = { buildContext, defaultDeps };
