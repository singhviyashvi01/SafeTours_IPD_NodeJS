const test = require('node:test');
const assert = require('node:assert/strict');
const locationService = require('./locationService');

const NOW = new Date('2026-10-06T12:00:00Z');
const USER = 'u1';

// In-memory Location model with the same unique (userId, idempotencyKey) rule as the real index.
function fakeLocationModel({ raceKeys = [] } = {}) {
  const docs = [];
  return {
    docs,
    find(filter) {
      const keys = filter.idempotencyKey.$in;
      const rows = docs.filter((d) => d.userId === filter.userId && keys.includes(d.idempotencyKey));
      return { select: () => ({ lean: async () => rows }) };
    },
    async insertMany(list) {
      const writeErrors = [];
      list.forEach((d) => {
        const dup = docs.some((x) => x.userId === d.userId && x.idempotencyKey === d.idempotencyKey) || raceKeys.includes(d.idempotencyKey);
        if (dup) writeErrors.push({ code: 11000 });
        else docs.push(d);
      });
      if (writeErrors.length) {
        const e = new Error('E11000 duplicate key');
        e.writeErrors = writeErrors;
        throw e;
      }
    },
  };
}

const pt = (n, extra = {}) => ({
  idempotencyKey: `point-key-${String(n).padStart(4, '0')}`,
  latitude: 19.07 + n * 0.0001,
  longitude: 72.87,
  accuracy: 12,
  timestamp: new Date(NOW.getTime() - n * 60000).toISOString(),
  ...extra,
});

test('a batch is stored once: re-sending the same points (same keys) adds nothing', async () => {
  const model = fakeLocationModel();
  const batch = [pt(1), pt(2), pt(3)];
  const first = await locationService.saveBatch(USER, batch, { model, now: NOW });
  const again = await locationService.saveBatch(USER, batch, { model, now: NOW });
  assert.equal(first.inserted, 3);
  assert.equal(again.inserted, 0);
  assert.equal(again.duplicates, 3);
  assert.equal(model.docs.length, 3);
});

test('a half-delivered batch (lost response) is completed by the retry: only the missing points are inserted', async () => {
  const model = fakeLocationModel();
  await locationService.saveBatch(USER, [pt(1), pt(2)], { model, now: NOW });
  const retry = await locationService.saveBatch(USER, [pt(1), pt(2), pt(3), pt(4)], { model, now: NOW });
  assert.equal(retry.inserted, 2);
  assert.equal(retry.duplicates, 2);
  assert.equal(model.docs.length, 4);
});

test('the same key twice inside ONE batch is stored once', async () => {
  const model = fakeLocationModel();
  const out = await locationService.saveBatch(USER, [pt(1), pt(1), pt(2)], { model, now: NOW });
  assert.equal(out.inserted, 2);
  assert.equal(out.duplicates, 1);
});

test('a concurrent duplicate that loses the unique-index race is counted as a duplicate, not raised as an error', async () => {
  const model = fakeLocationModel({ raceKeys: [pt(2).idempotencyKey] });
  const out = await locationService.saveBatch(USER, [pt(1), pt(2)], { model, now: NOW });
  assert.equal(out.inserted, 1);
  assert.equal(out.duplicates, 1);
});

test('impossible timestamps are rejected one by one without failing the batch', async () => {
  const model = fakeLocationModel();
  const out = await locationService.saveBatch(
    USER,
    [pt(1), pt(2, { timestamp: new Date(NOW.getTime() + 3600000).toISOString() }), pt(3, { timestamp: 'garbage' }), pt(4, { timestamp: new Date(NOW.getTime() - 40 * 86400000).toISOString() })],
    { model, now: NOW }
  );
  assert.equal(out.inserted, 1);
  assert.equal(out.rejected.length, 3);
  assert.deepEqual(out.rejected.map((r) => r.index), [1, 2, 3]);
});

test('other write errors are not swallowed', async () => {
  const model = fakeLocationModel();
  model.insertMany = async () => { throw new Error('connection lost'); };
  await assert.rejects(() => locationService.saveBatch(USER, [pt(1)], { model, now: NOW }), /connection lost/);
});

test('the same key for a different user is a different point', async () => {
  const model = fakeLocationModel();
  await locationService.saveBatch('u1', [pt(1)], { model, now: NOW });
  const other = await locationService.saveBatch('u2', [pt(1)], { model, now: NOW });
  assert.equal(other.inserted, 1);
});
