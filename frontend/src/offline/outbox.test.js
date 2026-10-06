const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const logic = require('./outboxLogic');
const { createOutboxStore, OUTBOX_SCHEMA } = require('./outboxStoreCore');
const { sendWithBisect } = require('./batchSend');
const { outbox: cfg } = require('./offlineConfig');

// ── helpers ──────────────────────────────────────────────────────────────────────────────────────
const row = (o) => ({ id: 1, type: 'location_point', payload: {}, idempotencyKey: 'k', createdAt: 0, attempts: 0, nextRetryAt: null, status: 'pending', lastError: null, ...o });

/** A real SQLite database (node:sqlite) behind the same async driver the app uses with expo-sqlite. */
function memoryDriver() {
  const raw = new DatabaseSync(':memory:');
  raw.exec(OUTBOX_SCHEMA);
  return {
    raw,
    async runAsync(sql, ...p) { const r = raw.prepare(sql).run(...p); return { changes: r.changes, lastInsertRowId: r.lastInsertRowid }; },
    async getAllAsync(sql, ...p) { return raw.prepare(sql).all(...p); },
    async getFirstAsync(sql, ...p) { return raw.prepare(sql).get(...p) || null; },
  };
}
function makeStore({ cfgOverride = {}, start = 1_000_000 } = {}) {
  const clock = { t: start };
  const db = memoryDriver();
  let n = 0;
  const store = createOutboxStore({
    db,
    cfg: { ...cfg, ...cfgOverride, cap: { ...cfg.cap, ...(cfgOverride.cap || {}) } },
    now: () => clock.t,
    uuid: () => `uuid-${String((n += 1)).padStart(6, '0')}`,
    rand: () => 0.5, // no jitter: spread = 1
  });
  return { store, clock, db };
}

// ── backoff ──────────────────────────────────────────────────────────────────────────────────────
test('backoff doubles from the base, is capped at the max, and jitter stays within +/- 25 %', () => {
  const b = cfg.backoff; // base 5 s, factor 2, max 15 min
  const mid = () => 0.5; // spread exactly 1.0
  assert.equal(logic.backoffDelay(1, b, mid), 5000);
  assert.equal(logic.backoffDelay(2, b, mid), 10000);
  assert.equal(logic.backoffDelay(3, b, mid), 20000);
  assert.equal(logic.backoffDelay(10, b, mid), b.maxMs); // 5 s * 2^9 = 42 min, capped to 15 min
  assert.equal(logic.backoffDelay(30, b, mid), b.maxMs);
  assert.equal(logic.backoffDelay(3, b, () => 0), 15000); // -25 %
  assert.equal(logic.backoffDelay(3, b, () => 0.999999), 25000); // +25 %
  // jitter is real: different random draws give different delays
  assert.notEqual(logic.backoffDelay(4, b, () => 0.1), logic.backoffDelay(4, b, () => 0.9));
});

test('a retryable failure schedules the next try with backoff and counts the attempt', () => {
  const r = row({ type: 'journey_update', attempts: 0 });
  const p1 = logic.afterAttempt(r, { kind: 'retry', error: 'network' }, 1000, cfg, () => 0.5);
  assert.deepEqual([p1.status, p1.attempts, p1.nextRetryAt], ['pending', 1, 1000 + 5000]);
  const p2 = logic.afterAttempt({ ...r, attempts: 1 }, { kind: 'retry' }, 1000, cfg, () => 0.5);
  assert.equal(p2.nextRetryAt, 1000 + 10000);
  // a server Retry-After (429) longer than the backoff wins
  const p3 = logic.afterAttempt(r, { kind: 'retry', retryAfterMs: 60000 }, 1000, cfg, () => 0.5);
  assert.equal(p3.nextRetryAt, 1000 + 60000);
});

test('non-SOS rows give up (status failed) after the attempt limit; SOS rows never do', () => {
  const limit = cfg.maxAttempts.community_report;
  const last = logic.afterAttempt(row({ type: 'community_report', attempts: limit - 1 }), { kind: 'retry' }, 0, cfg);
  assert.equal(last.status, 'failed');
  const sos = logic.afterAttempt(row({ type: 'sos', attempts: 500 }), { kind: 'retry' }, 0, cfg);
  assert.equal(sos.status, 'pending');
  assert.ok(sos.nextRetryAt > 0);
});

// ── dead-letter rules ────────────────────────────────────────────────────────────────────────────
test('dead-letter rules: 4xx is dead EXCEPT 408 and 429; 5xx and network errors retry; 2xx is sent', () => {
  const k = (status, networkError) => logic.classifyResult({ status, networkError });
  assert.equal(k(200), 'sent');
  assert.equal(k(201), 'sent');
  assert.equal(k(400), 'dead');
  assert.equal(k(401), 'dead');
  assert.equal(k(403), 'dead');
  assert.equal(k(404), 'dead');
  assert.equal(k(409), 'dead');
  assert.equal(k(422), 'dead');
  assert.equal(k(408), 'retry');
  assert.equal(k(429), 'retry');
  assert.equal(k(500), 'retry');
  assert.equal(k(502), 'retry');
  assert.equal(k(503), 'retry');
  assert.equal(k(504), 'retry');
  assert.equal(k(undefined, true), 'retry'); // no response at all
  assert.equal(k(0), 'retry');
});

test('a dead row is not retried by itself; only the user can bring it back (Retry), or remove it (Discard)', async () => {
  const { store, clock } = makeStore();
  const { row: r } = await store.enqueue({ type: 'community_report', payload: { a: 1 } });
  const [claimed] = await store.claimNext();
  assert.equal(claimed.id, r.id);
  await store.applyOutcome(r.id, { kind: 'dead', error: 'HTTP 400: bad incident type' });
  assert.equal((await store.get(r.id)).status, 'dead');

  clock.t += 10 * 24 * 3600 * 1000; // far in the future: still not picked up
  assert.equal(await store.claimNext(), null);

  assert.equal(await store.retry(r.id), true);
  const back = await store.get(r.id);
  assert.deepEqual([back.status, back.attempts, back.lastError], ['pending', 0, null]);
  assert.equal((await store.claimNext()).length, 1);

  await store.applyOutcome(r.id, { kind: 'dead', error: 'again' });
  assert.equal(await store.discard(r.id), true);
  assert.equal(await store.get(r.id), null);
  assert.equal(await store.retry(r.id), false);
});

test('retry() only works on failed or dead rows, never on pending or sent ones', async () => {
  const { store } = makeStore();
  const { row: r } = await store.enqueue({ type: 'journey_update', payload: {} });
  assert.equal(await store.retry(r.id), false);
});

// ── ordering ─────────────────────────────────────────────────────────────────────────────────────
test('ordering: SOS first, then cancellations, journey updates, geofence events, community reports, location points; oldest first inside a type', () => {
  const rows = [
    row({ id: 1, type: 'location_point', createdAt: 1 }),
    row({ id: 2, type: 'community_report', createdAt: 2 }),
    row({ id: 3, type: 'geofence_event', createdAt: 3 }),
    row({ id: 4, type: 'journey_update', createdAt: 5 }),
    row({ id: 5, type: 'journey_update', createdAt: 4 }),
    row({ id: 6, type: 'sos_cancel', createdAt: 9 }),
    row({ id: 7, type: 'sos', createdAt: 10 }),
    row({ id: 8, type: 'sos', createdAt: 8 }),
  ];
  assert.deepEqual(logic.orderRows(rows, cfg).map((r) => r.id), [8, 7, 6, 5, 4, 3, 2, 1]);
});

test('ordering end to end: claimNext hands out the SOS before older location points', async () => {
  const { store, clock } = makeStore();
  await store.enqueue({ type: 'location_point', payload: { n: 1 } });
  clock.t += 1000;
  await store.enqueue({ type: 'community_report', payload: {} });
  clock.t += 1000;
  await store.enqueue({ type: 'sos', payload: {} });
  const first = await store.claimNext();
  assert.equal(first[0].type, 'sos');
  const second = await store.claimNext();
  assert.equal(second[0].type, 'community_report');
  const third = await store.claimNext();
  assert.equal(third[0].type, 'location_point');
  assert.equal(await store.claimNext(), null);
});

test('a row still backing off blocks NEWER rows of the same type (order kept) but not other types', () => {
  const rows = [
    row({ id: 1, type: 'journey_update', createdAt: 1, nextRetryAt: 9000 }), // backing off
    row({ id: 2, type: 'journey_update', createdAt: 2, nextRetryAt: null }), // newer, would be due
    row({ id: 3, type: 'community_report', createdAt: 3, nextRetryAt: null }),
  ];
  const next = logic.selectNext(rows, 5000, cfg);
  assert.deepEqual(next.map((r) => r.id), [3]);
  // when the old one is due, it goes first
  assert.deepEqual(logic.selectNext(rows, 9000, cfg).map((r) => r.id), [1]);
});

test('location points and geofence events are sent in batches, SOS and reports one at a time', () => {
  const pts = Array.from({ length: 250 }, (_, i) => row({ id: i + 1, type: 'location_point', createdAt: i }));
  assert.equal(logic.selectNext(pts, 0, cfg).length, cfg.batchSize.location_point);
  assert.equal(logic.selectNext([row({ id: 1, type: 'sos' }), row({ id: 2, type: 'sos', createdAt: 5 })], 0, cfg).length, 1);
});

// ── startup reset ────────────────────────────────────────────────────────────────────────────────
test('startup reset: rows left in "sending" by a killed app go back to pending (nothing else changes)', async () => {
  const { store } = makeStore();
  const a = (await store.enqueue({ type: 'sos', payload: {} })).row;
  const b = (await store.enqueue({ type: 'journey_update', payload: {} })).row;
  const c = (await store.enqueue({ type: 'community_report', payload: {} })).row;
  await store.claimNext(); // sos -> sending
  await store.claimNext(); // journey_update -> sending
  await store.applyOutcome(b.id, { kind: 'dead', error: 'x' }); // b is dead, must stay dead

  assert.equal((await store.get(a.id)).status, 'sending');
  const reset = await store.resetStuck({ startup: true });
  assert.equal(reset, 1);
  const after = await store.get(a.id);
  assert.deepEqual([after.status, after.attempts, after.claimedAt], ['pending', 0, null]); // no attempt is charged
  assert.equal((await store.get(b.id)).status, 'dead');
  assert.equal((await store.get(c.id)).status, 'pending');
});

test('runtime reset: only rows that have been "sending" longer than sendingStaleMs', async () => {
  const { store, clock } = makeStore();
  await store.enqueue({ type: 'sos', payload: {} });
  await store.claimNext();
  clock.t += cfg.sendingStaleMs - 1000;
  assert.equal(await store.resetStuck(), 0);
  clock.t += 2000;
  assert.equal(await store.resetStuck(), 1);
});

// ── dedupe and idempotency (phone side) ──────────────────────────────────────────────────────────
test('the idempotency key is made once at creation and never regenerated by retries', async () => {
  const { store, clock } = makeStore();
  const { row: r } = await store.enqueue({ type: 'community_report', payload: { x: 1 } });
  const key = r.idempotencyKey;
  assert.match(key, /^uuid-/);
  for (let i = 1; i <= 4; i += 1) {
    const [sending] = await store.claimNext();
    assert.equal(sending.idempotencyKey, key); // the key handed to the uploader is always the original
    await store.applyOutcome(r.id, { kind: 'retry', error: 'network' });
    const again = await store.get(r.id);
    assert.equal(again.attempts, i);
    assert.equal(again.idempotencyKey, key);
    clock.t += 20 * 60 * 1000; // past the longest backoff: due again
  }
});

test('enqueuing the same key twice gives ONE row (a double tap or a re-run never doubles the SOS)', async () => {
  const { store } = makeStore();
  const first = await store.enqueue({ type: 'sos', payload: { n: 1 }, idempotencyKey: 'sos-key-0001' });
  const second = await store.enqueue({ type: 'sos', payload: { n: 2 }, idempotencyKey: 'sos-key-0001' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(second.row.id, first.row.id);
  assert.deepEqual(second.row.payload, { n: 1 }); // the original payload is kept
  assert.equal((await store.list()).length, 1);
});

test('concurrent enqueues of the same key still make one row (the UNIQUE index decides)', async () => {
  const { store } = makeStore();
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => store.enqueue({ type: 'sos', payload: {}, idempotencyKey: 'sos-key-race' })));
  assert.equal((await store.list()).length, 1);
  assert.equal(results.filter((r) => !r.duplicate).length, 1);
});

// ── queue cap ────────────────────────────────────────────────────────────────────────────────────
const capCfg = (maxRows) => ({ cap: { maxRows } });

test('queue cap: when full, the OLDEST location points are dropped first and the new row is kept', async () => {
  const { store, clock } = makeStore({ cfgOverride: capCfg(5) });
  for (let i = 0; i < 5; i += 1) {
    await store.enqueue({ type: 'location_point', payload: { n: i } });
    clock.t += 1000;
  }
  const res = await store.enqueue({ type: 'location_point', payload: { n: 5 } });
  assert.equal(res.ok, true);
  assert.equal(res.dropped, 1);
  const kept = (await store.list()).map((r) => r.payload.n);
  assert.deepEqual(kept, [1, 2, 3, 4, 5]); // point 0 (the oldest) is gone
});

test('queue cap: drop order is location points, then geofence events, then community reports, then journey updates', async () => {
  const { store, clock } = makeStore({ cfgOverride: capCfg(4) });
  for (const type of ['journey_update', 'community_report', 'geofence_event', 'location_point']) {
    await store.enqueue({ type, payload: {} });
    clock.t += 1000;
  }
  await store.enqueue({ type: 'geofence_event', payload: {} }); // evicts the location point
  assert.deepEqual((await store.list()).map((r) => r.type).sort(), ['community_report', 'geofence_event', 'geofence_event', 'journey_update']);
  await store.enqueue({ type: 'journey_update', payload: {} }); // no location points left: evicts the oldest geofence event
  const types = (await store.list()).map((r) => r.type).sort();
  assert.deepEqual(types, ['community_report', 'geofence_event', 'journey_update', 'journey_update']);
});

test('queue cap: SOS rows are NEVER dropped and a new SOS is always accepted, even over the cap', async () => {
  const { store, clock } = makeStore({ cfgOverride: capCfg(3) });
  for (let i = 0; i < 3; i += 1) {
    await store.enqueue({ type: 'sos', payload: { n: i }, idempotencyKey: `sos-key-000${i}` });
    clock.t += 1000;
  }
  const fourth = await store.enqueue({ type: 'sos', payload: { n: 3 }, idempotencyKey: 'sos-key-0003' });
  assert.equal(fourth.ok, true);
  assert.equal(fourth.overCap, true);
  assert.equal((await store.list({ types: ['sos'] })).length, 4);
});

test('queue cap: when only SOS rows are left, a new non-SOS row is refused (and says so) instead of evicting an SOS', async () => {
  const { store } = makeStore({ cfgOverride: capCfg(2) });
  await store.enqueue({ type: 'sos', payload: {}, idempotencyKey: 'sos-key-0001' });
  await store.enqueue({ type: 'sos', payload: {}, idempotencyKey: 'sos-key-0002' });
  const refused = await store.enqueue({ type: 'location_point', payload: {} });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'queue_full');
  assert.equal((await store.list()).length, 2);
});

test('queue cap: a row in flight is not evicted', async () => {
  const { store, clock } = makeStore({ cfgOverride: capCfg(2) });
  await store.enqueue({ type: 'location_point', payload: { n: 0 } });
  clock.t += 1000;
  await store.enqueue({ type: 'location_point', payload: { n: 1 } });
  const [inFlight] = await store.claimNext({}); // both are claimed as one batch
  assert.ok(inFlight);
  const res = await store.enqueue({ type: 'community_report', payload: {} });
  assert.equal(res.ok, false); // nothing droppable: both points are in flight
});

test('age rule: rows older than the max age are purged (SOS excepted); sent rows are kept only briefly', async () => {
  const { store, clock } = makeStore();
  await store.enqueue({ type: 'location_point', payload: {} });
  await store.enqueue({ type: 'sos', payload: {}, idempotencyKey: 'sos-key-0001' });
  const sent = (await store.enqueue({ type: 'community_report', payload: {} })).row;
  await store.claimNext({ skipTypes: ['sos', 'location_point'] });
  await store.applyOutcome(sent.id, { kind: 'sent' });

  clock.t += cfg.cap.sentKeepMs + 1000;
  await store.purge();
  assert.equal(await store.get(sent.id), null); // sent row expired
  assert.equal((await store.list()).length, 2);

  clock.t += cfg.cap.pendingMaxAgeMs;
  await store.purge();
  const left = await store.list();
  assert.deepEqual(left.map((r) => r.type), ['sos']); // the old location point went, the SOS stays
});

test('summary counts what the UI shows: waiting, dead, live SOS', async () => {
  const { store } = makeStore();
  await store.enqueue({ type: 'sos', payload: {} });
  await store.enqueue({ type: 'community_report', payload: {} });
  const dead = (await store.enqueue({ type: 'journey_update', payload: {} })).row;
  await store.claimNext({ skipTypes: ['sos', 'community_report'] });
  await store.applyOutcome(dead.id, { kind: 'dead', error: 'x' });
  const s = await store.summary();
  assert.equal(s.waiting, 2);
  assert.equal(s.dead, 1);
  assert.equal(s.sosLive, 1);
});

// ── cancel planning ──────────────────────────────────────────────────────────────────────────────
test('cancelling a queued SOS: removed if unsent, flagged if in flight, cancelled on the server if delivered', () => {
  assert.equal(logic.planCancel(row({ status: 'pending' })), 'remove');
  assert.equal(logic.planCancel(row({ status: 'failed' })), 'remove');
  assert.equal(logic.planCancel(row({ status: 'sending' })), 'flag');
  assert.equal(logic.planCancel(row({ status: 'sent', payload: { serverId: 'abc' } })), 'cancel_server');
  assert.equal(logic.planCancel(row({ status: 'sent', payload: {} })), 'none');
});

// ── poison-pill batches ──────────────────────────────────────────────────────────────────────────
test('a batch with ONE bad item is split until the bad item is isolated; the good items are sent', async () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ n: i }));
  const calls = [];
  const send = async (group) => {
    calls.push(group.length);
    return group.some((g) => g.n === 4) ? { kind: 'dead', error: 'HTTP 400' } : { kind: 'sent' };
  };
  const out = await sendWithBisect(items, send);
  assert.equal(out.length, 9);
  assert.deepEqual(out.filter((o) => o.kind === 'dead').map((o) => o.item.n), [4]);
  assert.equal(out.filter((o) => o.kind === 'sent').length, 8);
  assert.ok(calls.length < 2 * items.length); // bounded number of requests
});

test('a transient error (network / 5xx) is never split: the whole batch is retried later', async () => {
  const calls = [];
  const out = await sendWithBisect([{ n: 1 }, { n: 2 }, { n: 3 }], async (g) => { calls.push(g.length); return { kind: 'retry', error: 'timeout' }; });
  assert.deepEqual(calls, [3]);
  assert.ok(out.every((o) => o.kind === 'retry'));
});

test('if the server starts failing midway through splitting, the rest is postponed, not hammered', async () => {
  let call = 0;
  const out = await sendWithBisect([{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }], async () => {
    call += 1;
    return call === 1 ? { kind: 'dead', error: '400' } : { kind: 'retry', error: '503' };
  });
  assert.equal(call, 2);
  assert.ok(out.every((o) => o.kind === 'retry'));
});
