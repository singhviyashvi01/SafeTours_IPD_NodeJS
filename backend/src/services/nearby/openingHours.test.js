const test = require('node:test');
const assert = require('node:assert/strict');
const { isOpenNow, parseOpeningHours } = require('./openingHours');

// IST = UTC+5:30. 2026-10-05 is a Monday, 2026-10-10 a Saturday, 2026-10-11 a Sunday.
const ist = (isoDate, hhmm) => new Date(`${isoDate}T${hhmm}:00+05:30`);

test('24/7 is open; empty or missing is unknown (never guessed)', () => {
  assert.equal(isOpenNow('24/7', ist('2026-10-05', '03:00')), true);
  assert.equal(isOpenNow('', ist('2026-10-05', '10:00')), null);
  assert.equal(isOpenNow(undefined, ist('2026-10-05', '10:00')), null);
  assert.equal(isOpenNow(null, ist('2026-10-05', '10:00')), null);
});

test('weekday range with times, evaluated in IST', () => {
  const h = 'Mo-Fr 09:00-17:00';
  assert.equal(isOpenNow(h, ist('2026-10-05', '10:00')), true);
  assert.equal(isOpenNow(h, ist('2026-10-05', '08:59')), false);
  assert.equal(isOpenNow(h, ist('2026-10-05', '17:00')), false); // end is exclusive
  assert.equal(isOpenNow(h, ist('2026-10-10', '10:00')), false); // Saturday: not listed means closed
});

test('several rules, and "off" overrides', () => {
  const h = 'Mo-Fr 09:00-17:00; Sa 09:00-13:00; Su off';
  assert.equal(isOpenNow(h, ist('2026-10-10', '12:00')), true);
  assert.equal(isOpenNow(h, ist('2026-10-10', '14:00')), false);
  assert.equal(isOpenNow(h, ist('2026-10-11', '12:00')), false);
  assert.equal(isOpenNow('Mo-Su 08:00-20:00; Su off', ist('2026-10-11', '12:00')), false);
});

test('multiple intervals per day and a rule without days', () => {
  assert.equal(isOpenNow('Mo-Fr 09:00-13:00,16:00-20:00', ist('2026-10-05', '14:00')), false);
  assert.equal(isOpenNow('Mo-Fr 09:00-13:00,16:00-20:00', ist('2026-10-05', '18:00')), true);
  assert.equal(isOpenNow('10:00-22:00', ist('2026-10-11', '21:00')), true);
});

test('24:00 end and intervals that run past midnight', () => {
  assert.equal(isOpenNow('Mo-Su 00:00-24:00', ist('2026-10-05', '23:59')), true);
  assert.equal(isOpenNow('Mo-Su 22:00-06:00', ist('2026-10-05', '23:00')), true);
  assert.equal(isOpenNow('Mo-Su 22:00-06:00', ist('2026-10-05', '03:00')), true); // started yesterday
  assert.equal(isOpenNow('Mo-Su 22:00-06:00', ist('2026-10-05', '12:00')), false);
  assert.equal(isOpenNow('Fr 22:00-06:00', ist('2026-10-10', '03:00')), true); // Saturday 03:00 belongs to Friday's shift
  assert.equal(isOpenNow('Fr 22:00-06:00', ist('2026-10-11', '03:00')), false);
});

test('anything outside the supported grammar is unknown, not a guess', () => {
  for (const s of ['Mo-Fr 09:00-17:00; PH off', 'sunrise-sunset', 'Mo-Fr 09:00-17:00 "by appointment"', 'week 1-53 Mo 09:00-10:00', 'Mo-Fr 9am-5pm', 'Jan-Mar Mo 10:00-12:00', 'by appointment', 'Mo-Fr 25:00-26:00']) {
    assert.equal(isOpenNow(s, ist('2026-10-05', '10:00')), null, s);
  }
  assert.equal(parseOpeningHours('24/7').always, true);
});
