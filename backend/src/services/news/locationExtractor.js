const { localities, NOT_PLACES } = require('../../config/mumbaiGazetteer');

/**
 * Extracts WHERE an article happened.
 *  1. Gazetteer: whole-word match of ~40 Mumbai localities and their aliases (no API call).
 *  2. Candidates: place names the gazetteer does not know, pulled out with context patterns
 *     ("near Vikhroli station", "at Lalbaug flyover", "in Antop Hill"). The caller geocodes these
 *     (with caching). Generic words (Mumbai, days, months, courts...) are never candidates.
 * "Mumbai" on its own is not a location.
 */

// Short or common-word aliases must match with exact capitalisation.
const CASE_SENSITIVE = new Set(['Fort', 'VT', 'CST', 'BKC']);

const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const entries = [];
for (const loc of localities) {
  for (const alias of [loc.name, ...loc.aliases]) {
    entries.push({
      alias,
      loc,
      rx: new RegExp(`(?<![A-Za-z])${escapeRx(alias).replace(/\s+/g, '\\s+')}(?![A-Za-z])`, CASE_SENSITIVE.has(alias) ? 'g' : 'gi'),
    });
  }
}
entries.sort((a, b) => b.alias.length - a.alias.length); // longest alias first: "Lower Parel" before "Parel"

/** @returns {Array<{name,lat,lng,index,source:'gazetteer'}>} ordered by position, one per locality */
function extractGazetteerLocations(text) {
  if (!text) return [];
  const taken = []; // [start, end) ranges already claimed by a longer alias
  const found = new Map();

  for (const { alias, loc, rx } of entries) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      if (!found.has(loc.name) || found.get(loc.name).index > start) {
        found.set(loc.name, { name: loc.name, lat: loc.lat, lng: loc.lng, index: start, source: 'gazetteer', alias });
      }
    }
  }
  return [...found.values()].sort((a, b) => a.index - b.index);
}

const PREPOSITION = /\b(?:in|at|near|outside|inside|off|around|opposite|from|to)\s+((?:[A-Z][\w'-]+)(?:\s+[A-Z][\w'-]+){0,2})/g;
const SUFFIXED = /\b((?:[A-Z][\w'-]+)(?:\s+[A-Z][\w'-]+){0,2})\s+(?:station|flyover|bridge|road|nagar|naka|chowk|market|junction|circle|signal|colony|chawl|hill)\b/g;

const clean = (s) => s.replace(/['’]s$/i, '').trim();

/** Place-name candidates NOT already covered by the gazetteer, best first. */
function extractCandidates(text, knownLocations = []) {
  if (!text) return [];
  const known = new Set(knownLocations.map((l) => l.name.toLowerCase()));
  const out = [];
  const seen = new Set();

  const consider = (raw) => {
    const name = clean(raw);
    const lower = name.toLowerCase();
    if (name.length < 3 || NOT_PLACES.has(lower) || seen.has(lower)) return;
    // Drop leading generic words ("The Powai" -> "Powai") and anything made only of generic words.
    const words = name.split(/\s+/).filter((w) => !NOT_PLACES.has(w.toLowerCase()));
    if (words.length === 0) return;
    const trimmed = words.join(' ');
    if (known.has(trimmed.toLowerCase()) || extractGazetteerLocations(trimmed).length > 0) return;
    seen.add(lower);
    out.push(trimmed);
  };

  for (const rx of [SUFFIXED, PREPOSITION]) {
    rx.lastIndex = 0;
    let m;
    while ((m = rx.exec(text)) !== null) consider(m[1]);
  }
  return out;
}

module.exports = { extractGazetteerLocations, extractCandidates };
