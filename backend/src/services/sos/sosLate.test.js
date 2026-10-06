const test = require('node:test');
const assert = require('node:assert/strict');
const { formatIst, decideLateness, splitBySmsReport, samePhone, formatLateBy } = require('./sosLate');

const NOW = new Date('2026-10-06T16:05:00Z'); // 21:35 IST

test('formatIst uses fixed UTC+5:30 and crosses midnight correctly', () => {
  assert.equal(formatIst(NOW), '06 Oct 21:35 IST');
  assert.equal(formatIst(new Date('2026-12-31T19:00:00Z')), '01 Jan 00:30 IST');
});

test('decideLateness: late only beyond the grace window; original time kept either way', () => {
  const ago = (s) => new Date(NOW.getTime() - s * 1000).toISOString();
  const early = decideLateness({ clientCreatedAt: ago(119), now: NOW });
  assert.equal(early.late, false);
  assert.equal(early.lateBySeconds, 119);
  const d = decideLateness({ clientCreatedAt: ago(121), now: NOW });
  assert.equal(d.late, true);
  assert.equal(d.triggeredAt.toISOString(), ago(121));
});

test('decideLateness: missing, invalid, future and too-old timestamps are never trusted', () => {
  assert.equal(decideLateness({ clientCreatedAt: undefined, now: NOW }).ignored, null);
  assert.equal(decideLateness({ clientCreatedAt: 'not a date', now: NOW }).ignored, 'invalid');
  assert.equal(decideLateness({ clientCreatedAt: new Date(NOW.getTime() + 120000).toISOString(), now: NOW }).ignored, 'future');
  assert.equal(decideLateness({ clientCreatedAt: new Date(NOW.getTime() - 49 * 3600000).toISOString(), now: NOW }).ignored, 'too_old');
  const skew = decideLateness({ clientCreatedAt: new Date(NOW.getTime() + 30000).toISOString(), now: NOW });
  assert.equal(skew.ignored, null); // 30 s of clock skew is tolerated
  assert.equal(skew.late, false);
});

test('phone numbers match by their last 10 digits', () => {
  assert.ok(samePhone('+91 98765 43210', '09876543210'));
  assert.ok(!samePhone('+919876543210', '+919876543211'));
  assert.ok(!samePhone('123', '123')); // too short to be a number
});

test('splitBySmsReport only skips contacts listed in sentTo', () => {
  const contacts = [{ phone: '+919800000001' }, { phone: '+919800000002' }];
  assert.equal(splitBySmsReport(contacts, null).toText.length, 2);
  assert.equal(splitBySmsReport(contacts, { outcome: 'composer_opened', sentTo: [] }).toText.length, 2);
  const r = splitBySmsReport(contacts, { sentTo: ['9800000001'] });
  assert.equal(r.alreadyTexted.length, 1);
  assert.equal(r.toText[0].phone, '+919800000002');
});

test('formatLateBy', () => {
  assert.equal(formatLateBy(20), '1 min');
  assert.equal(formatLateBy(600), '10 min');
  assert.equal(formatLateBy(7500), '2 h 5 min');
  assert.equal(formatLateBy(26 * 3600), '1 d 2 h');
});
