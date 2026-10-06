/**
 * Late-delivery helpers for an SOS that was queued on the phone and reached the server later.
 * Pure functions: no database, no clock (callers pass `now`).
 */

const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** "06 Oct 21:35 IST" (fixed UTC+5:30, no Intl dependency). */
function formatIst(date) {
  const d = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  return `${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} IST`;
}

/**
 * Decides whether an SOS counts as "delivered late" and what its trigger time is.
 *
 *   clientCreatedAt  when the user pressed SOS (phone clock, ISO string), optional
 *   late             clientCreatedAt is more than lateAfterSeconds before `now`
 *   triggeredAt      clientCreatedAt when trusted, else `now`
 *
 * A phone clock can be wrong, so the value is only trusted when it is not in the future (60 s tolerance) and
 * not older than maxBackdateHours. Otherwise it is ignored and reported in `ignored`.
 */
function decideLateness({ clientCreatedAt, now, lateAfterSeconds = 120, maxBackdateHours = 48 }) {
  const nowMs = now.getTime();
  if (clientCreatedAt === undefined || clientCreatedAt === null || clientCreatedAt === '') {
    return { late: false, triggeredAt: now, lateBySeconds: 0, ignored: null };
  }
  const ms = new Date(clientCreatedAt).getTime();
  if (Number.isNaN(ms)) return { late: false, triggeredAt: now, lateBySeconds: 0, ignored: 'invalid' };
  if (ms > nowMs + 60000) return { late: false, triggeredAt: now, lateBySeconds: 0, ignored: 'future' };
  if (nowMs - ms > maxBackdateHours * 3600000) return { late: false, triggeredAt: now, lateBySeconds: 0, ignored: 'too_old' };

  const lateBySeconds = Math.max(0, Math.round((nowMs - ms) / 1000));
  return { late: lateBySeconds > lateAfterSeconds, triggeredAt: new Date(ms), lateBySeconds, ignored: null };
}

const digits = (p) => String(p || '').replace(/\D/g, '');
/** Compares phone numbers by their last 10 digits, so +91 98765 43210 equals 09876543210. */
const samePhone = (a, b) => {
  const x = digits(a);
  const y = digits(b);
  return x.length >= 7 && y.length >= 7 && x.slice(-10) === y.slice(-10);
};

/**
 * Splits contacts into those the device already texted (outcome 'sent') and those the server should text.
 * Only a CONFIRMED send counts: 'composer_opened' / 'failed' / 'no_permission' prove nothing, so the server
 * still texts those contacts (a possible duplicate is better than a missing alert).
 * @param {Array<{phone:string}>} contacts
 * @param {{sentTo?:string[]}|null} clientSms
 */
function splitBySmsReport(contacts, clientSms) {
  const sentTo = clientSms && Array.isArray(clientSms.sentTo) ? clientSms.sentTo : [];
  const alreadyTexted = [];
  const toText = [];
  for (const c of contacts) {
    if (sentTo.some((p) => samePhone(p, c.phone))) alreadyTexted.push(c);
    else toText.push(c);
  }
  return { alreadyTexted, toText };
}

/** "3 min", "2 h 5 min", "1 d 2 h" */
function formatLateBy(seconds) {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

module.exports = { formatIst, decideLateness, splitBySmsReport, samePhone, formatLateBy };
