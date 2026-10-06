const defaultConfig = require('../../config/risk.config');

/**
 * riskEngine — pure scoring logic (no database, no network, no clock access except the
 * `now` you pass in). Everything is driven by config/risk.config.js.
 *
 * evaluate() turns the stored components of one cell into:
 *   baseRisk      weighted mean over the components that have usable data (weights renormalised)
 *   totalRisk     baseRisk x time-of-day x festival modifiers, clamped 0..100 (null if UNKNOWN)
 *   level         SAFE | LOW | MODERATE | HIGH | EXTREME, or UNKNOWN when coverage is too low
 *   dataConfidence 0..1: share of the total weight backed by usable data
 *   per-component status, weight, contribution and data age
 */

const round1 = (n) => Math.round(n * 10) / 10;
const round2 = (n) => Math.round(n * 100) / 100;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Time-of-day / festival logic lives in shared/deviceCore.js so the phone applies exactly the same rules.
const core = require('../../shared/deviceCore');
const localTime = core.localTime;
const timeModifier = (now, cfg = defaultConfig) =>
  core.timeModifier(now, { timezone: cfg.timezone, timeModifier: cfg.timeModifier, festivals: cfg.festivals });

function assessComponent(key, comp, feeds, nowMs, cfg) {
  const def = cfg.components[key];
  let updatedAt = null;
  let score = null;

  if (def.mode === 'feed') {
    const feed = feeds && feeds[key];
    updatedAt = feed && feed.updatedAt ? new Date(feed.updatedAt) : null;
    // "Nothing reported" is a real observation while the feed is healthy.
    score = comp && Number.isFinite(comp.score) ? comp.score : 0;
  } else {
    updatedAt = comp && comp.updatedAt ? new Date(comp.updatedAt) : null;
    score = comp && Number.isFinite(comp.score) ? comp.score : null;
  }

  const out = {
    key,
    label: def.label,
    configuredWeight: def.weight,
    mode: def.mode,
    ttlMinutes: def.ttlMinutes,
    score: null,
    status: 'missing',
    ageMinutes: null,
    updatedAt: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toISOString() : null,
    effectiveWeight: 0,
    confidenceWeight: 0,
    lowConfidence: false,
    demo: false,
  };

  if (!out.updatedAt || score === null) return out;

  const ageMinutes = Math.max(0, (nowMs - updatedAt.getTime()) / 60000);
  out.ageMinutes = Math.round(ageMinutes);
  out.score = clamp(score, 0, 100);
  out.lowConfidence = Boolean(comp && comp.meta && (comp.meta.lowConfidence || comp.meta.demo));
  out.demo = Boolean(comp && comp.meta && comp.meta.demo);

  let factor;
  if (ageMinutes <= def.ttlMinutes) {
    out.status = 'fresh';
    factor = 1;
  } else if (ageMinutes <= def.ttlMinutes * cfg.maxStaleFactor) {
    out.status = 'stale';
    factor = cfg.staleWeightFactor;
  } else {
    out.status = 'expired';
    factor = 0;
  }

  out.effectiveWeight = def.weight * factor;
  out.confidenceWeight = out.effectiveWeight * (out.lowConfidence ? cfg.lowConfidenceWeightFactor : 1);
  return out;
}

/**
 * @param {Object} input
 * @param {Object} input.components  { crime:{score,updatedAt,meta}, weather:{...}, ... }
 * @param {Object} [input.feeds]     { news:{updatedAt}, community:{updatedAt} }
 * @param {Date}   [input.now]
 * @param {Object} [input.cfg]       override config (tests)
 */
function evaluate({ components = {}, feeds = {}, now = new Date(), cfg = defaultConfig } = {}) {
  const nowMs = now.getTime();
  const keys = Object.keys(cfg.components);
  const assessed = keys.map((k) => assessComponent(k, components[k], feeds, nowMs, cfg));

  const totalConfiguredWeight = keys.reduce((a, k) => a + cfg.components[k].weight, 0);
  const sumEffective = assessed.reduce((a, c) => a + c.effectiveWeight, 0);
  const sumConfidence = assessed.reduce((a, c) => a + c.confidenceWeight, 0);

  const coverage = totalConfiguredWeight > 0 ? sumConfidence / totalConfiguredWeight : 0;
  const baseRisk =
    sumEffective > 0 ? assessed.reduce((a, c) => a + c.effectiveWeight * c.score, 0) / sumEffective : null;

  const breakdown = {};
  for (const c of assessed) {
    const normalizedWeight = sumEffective > 0 ? c.effectiveWeight / sumEffective : 0;
    breakdown[c.key] = {
      label: c.label,
      score: c.status === 'missing' || c.status === 'expired' ? null : c.score,
      lastKnownScore: c.score,
      status: c.status,
      available: c.effectiveWeight > 0,
      stale: c.status === 'stale',
      configuredWeight: c.configuredWeight,
      appliedWeight: round2(normalizedWeight),
      contribution: c.score === null ? 0 : round2(normalizedWeight * c.score),
      ageMinutes: c.ageMinutes,
      ttlMinutes: c.ttlMinutes,
      updatedAt: c.updatedAt,
      lowConfidence: c.lowConfidence,
      demo: c.demo,
    };
  }

  const missing = assessed.filter((c) => c.status === 'missing' || c.status === 'expired').map((c) => c.key);
  const stale = assessed.filter((c) => c.status === 'stale').map((c) => c.key);

  const modifiers = timeModifier(now, cfg);
  const dataConfidence = round2(coverage);
  const confidenceLabel =
    dataConfidence >= cfg.confidence.high ? 'HIGH' : dataConfidence >= cfg.confidence.medium ? 'MEDIUM' : 'LOW';

  const criticalMissing = cfg.criticalComponents.filter((k) => missing.includes(k));
  const anyLowConfidenceInput = assessed.some((c) => c.effectiveWeight > 0 && c.lowConfidence);
  const lowConfidence = confidenceLabel === 'LOW' || criticalMissing.length > 0 || anyLowConfidenceInput;

  const unknown = baseRisk === null || coverage < cfg.confidence.minCoverageForLevel;
  let totalRisk = null;
  let level = cfg.UNKNOWN;
  if (!unknown) {
    totalRisk = round1(clamp(baseRisk * modifiers.combinedMultiplier, 0, 100));
    level = cfg.levelForScore(totalRisk);
  }

  let topFactor = null;
  let topContribution = 0;
  for (const k of keys) {
    if (breakdown[k].contribution > topContribution) {
      topContribution = breakdown[k].contribution;
      topFactor = k;
    }
  }

  return {
    totalRisk,
    level,
    baseRisk: baseRisk === null ? null : round1(baseRisk),
    dataConfidence,
    confidenceLabel,
    lowConfidence,
    lowConfidenceReasons: [
      ...(confidenceLabel === 'LOW' ? ['low data coverage'] : []),
      ...criticalMissing.map((k) => `${k} data unavailable`),
      ...assessed.filter((c) => c.effectiveWeight > 0 && c.demo).map((c) => `${c.key} is demo data`),
      ...assessed
        .filter((c) => c.effectiveWeight > 0 && c.lowConfidence && !c.demo)
        .map((c) => `${c.key} is low confidence`),
    ],
    demo: assessed.some((c) => c.effectiveWeight > 0 && c.demo),
    unknown,
    missing,
    stale,
    topFactor,
    breakdown,
    modifiers: {
      time: modifiers.time,
      festival: modifiers.festival,
      combinedMultiplier: round2(modifiers.combinedMultiplier),
      localDate: modifiers.localDate,
    },
    computedAt: now.toISOString(),
  };
}

function isDangerLevel(level, cfg = defaultConfig) {
  return cfg.dangerLevels.includes(level);
}

module.exports = { evaluate, timeModifier, localTime, isDangerLevel };
