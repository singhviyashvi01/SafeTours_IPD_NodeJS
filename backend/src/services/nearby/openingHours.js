const riskCfg = require('../../config/risk.config');

/**
 * Evaluates an OpenStreetMap `opening_hours` string for "open right now" in the configured timezone.
 *
 * Deliberately conservative: it understands only "24/7" and plain rules such as
 *   "Mo-Fr 09:00-17:00; Sa 09:00-13:00", "Mo-Su 00:00-24:00", "Su off", "22:00-06:00"
 * and returns null (unknown) for anything else (public holidays, sunrise/sunset, week numbers,
 * comments...). An open/closed flag is never guessed.
 */
const DAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const UNSUPPORTED = /(PH|SH|sunrise|sunset|dawn|dusk|week|\[|\]|\+|"|easter|open|unknown|\|\||\bmonth\b|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;

const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (mi > 59 || h > 24 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
};

function parseDays(spec) {
  const out = new Set();
  for (const part of spec.split(',')) {
    const range = part.trim().split('-');
    const a = DAYS.indexOf(range[0]);
    const b = range.length > 1 ? DAYS.indexOf(range[1]) : a;
    if (a < 0 || b < 0 || range.length > 2) return null;
    for (let d = a; ; d = (d + 1) % 7) {
      out.add(d);
      if (d === b) break;
    }
  }
  return out;
}

/** @returns {Array<{days:Set<number>, intervals:Array<[number,number]>}>|{always:true}|null} */
function parseOpeningHours(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  if (s === '24/7') return { always: true };
  if (UNSUPPORTED.test(s.replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b/g, ''))) return null;

  const rules = [];
  for (const rule of s.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)(?:\s*,\s*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)?\s*(off|closed|\d{1,2}:\d{2}-\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}-\d{1,2}:\d{2})*)$/i.exec(rule);
    if (!m) return null;
    const days = m[1] ? parseDays(m[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
    if (!days) return null;
    if (/^(off|closed)$/i.test(m[2])) {
      rules.push({ days, intervals: [] });
      continue;
    }
    const intervals = [];
    for (const t of m[2].split(',')) {
      const [a, b] = t.trim().split('-').map(toMin);
      if (a === null || b === null) return null;
      intervals.push([a, b]);
    }
    rules.push({ days, intervals });
  }
  return rules.length ? rules : null;
}

function localParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(p.weekday);
  return { day, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** @returns {true|false|null} null when the string is missing or not understood */
function isOpenNow(raw, now = new Date(), timezone = riskCfg.timezone) {
  const rules = parseOpeningHours(raw);
  if (rules === null) return null;
  if (rules.always) return true;

  const { day, minutes } = localParts(now, timezone);
  const yesterday = (day + 6) % 7;

  // Today's own rules; a later matching rule overrides an earlier one (OSM semantics).
  let open = false;
  for (const r of rules) {
    if (!r.days.has(day)) continue;
    open = r.intervals.some(([a, b]) => (a <= b ? minutes >= a && minutes < b : minutes >= a));
  }
  // Intervals that started yesterday and run past midnight (e.g. 22:00-06:00).
  if (!open) {
    for (const r of rules) {
      if (r.days.has(yesterday) && r.intervals.some(([a, b]) => a > b && minutes < b)) open = true;
    }
  }
  return open;
}

module.exports = { parseOpeningHours, isOpenNow };
