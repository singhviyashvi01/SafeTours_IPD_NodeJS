const test = require('node:test');
const assert = require('node:assert/strict');
const { createIdempotency } = require('./idempotency');
const { buildMiddleware } = require('../middleware/idempotency');

// In-memory stand-in for the IdempotencyRecord model (unique on user+scope+key).
function fakeModel() {
  const docs = [];
  let seq = 0;
  const same = (d, f) => Object.entries(f).every(([k, v]) => (v && typeof v === 'object' && v.$lte ? new Date(d[k]) <= v.$lte : String(d[k]) === String(v)));
  return {
    docs,
    async create(data) {
      if (docs.some((d) => d.user === data.user && d.scope === data.scope && d.key === data.key)) {
        const e = new Error('E11000 duplicate key');
        e.code = 11000;
        throw e;
      }
      const d = { _id: `r${(seq += 1)}`, ...data };
      docs.push(d);
      return d;
    },
    async findOne(f) { return docs.find((d) => same(d, f)) || null; },
    async findOneAndUpdate(f, u) { const d = docs.find((x) => same(x, f)); if (d) Object.assign(d, u.$set); return d || null; },
    async updateOne(f, u) { const d = docs.find((x) => same(x, f)); if (d) Object.assign(d, u.$set); },
    async deleteOne(f) { const i = docs.findIndex((x) => same(x, f)); if (i >= 0) docs.splice(i, 1); },
  };
}

// Minimal req/res pair that behaves like Express for the parts the middleware touches.
function call(mw, { key, user = 'u1', handler }) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200,
      writableEnded: false,
      listeners: {},
      set(k, v) { headers[k] = v; return this; },
      status(c) { this.statusCode = c; return this; },
      json(body) { this.writableEnded = true; resolve({ status: this.statusCode, body, headers }); return this; },
      on(ev, fn) { this.listeners[ev] = fn; },
    };
    const req = { user: { _id: user }, get: (h) => (h.toLowerCase() === 'idempotency-key' ? key : undefined) };
    Promise.resolve(mw(req, res, () => handler(req, res)));
  });
}

test('same key sent twice: the handler runs once and the second answer is the stored one', async () => {
  const mw = buildMiddleware(createIdempotency(fakeModel()), 'POST community.report');
  let runs = 0;
  const handler = (req, res) => { runs += 1; res.status(201).json({ success: true, id: 'incident-1' }); };

  const first = await call(mw, { key: 'uuid-key-0001', handler });
  await new Promise((r) => setImmediate(r)); // let complete() land
  const second = await call(mw, { key: 'uuid-key-0001', handler });

  assert.equal(runs, 1);
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.deepEqual(second.body, { success: true, id: 'incident-1' });
  assert.equal(second.headers['Idempotent-Replay'], 'true');
});

test('different keys, or different users with the same key, are independent', async () => {
  const mw = buildMiddleware(createIdempotency(fakeModel()), 'POST x');
  let runs = 0;
  const handler = (req, res) => { runs += 1; res.status(200).json({ n: runs }); };
  await call(mw, { key: 'uuid-key-0001', handler });
  await call(mw, { key: 'uuid-key-0002', handler });
  await call(mw, { key: 'uuid-key-0001', user: 'u2', handler });
  assert.equal(runs, 3);
});

test('a failed first attempt (5xx) is forgotten, so the retry runs the handler again', async () => {
  const model = fakeModel();
  const mw = buildMiddleware(createIdempotency(model), 'POST x');
  let runs = 0;
  const handler = (req, res) => {
    runs += 1;
    if (runs === 1) res.status(500).json({ success: false });
    else res.status(201).json({ success: true });
  };
  const a = await call(mw, { key: 'uuid-key-0001', handler });
  await new Promise((r) => setImmediate(r));
  assert.equal(a.status, 500);
  assert.equal(model.docs.length, 0);
  const b = await call(mw, { key: 'uuid-key-0001', handler });
  assert.equal(b.status, 201);
  assert.equal(runs, 2);
});

test('a duplicate that arrives while the first is still running gets 503 + Retry-After, not a second run', async () => {
  const model = fakeModel();
  const mw = buildMiddleware(createIdempotency(model), 'POST x');
  let runs = 0;
  let release;
  const slow = (req, res) => { runs += 1; release = () => res.status(201).json({ success: true }); };
  const firstP = call(mw, { key: 'uuid-key-0001', handler: slow });
  await new Promise((r) => setImmediate(r));
  const dup = await call(mw, { key: 'uuid-key-0001', handler: slow });
  assert.equal(dup.status, 503);
  assert.equal(dup.headers['Retry-After'], '2');
  assert.equal(runs, 1);
  release();
  await firstP;
});

test('a pending record left by a crashed handler is taken over after the stale window', async () => {
  const model = fakeModel();
  let nowMs = Date.parse('2026-10-06T10:00:00Z');
  const store = createIdempotency(model, { now: () => new Date(nowMs), stalePendingMs: 60000 });
  assert.equal((await store.begin({ user: 'u1', scope: 's', key: 'uuid-key-0001' })).action, 'run');
  assert.equal((await store.begin({ user: 'u1', scope: 's', key: 'uuid-key-0001' })).action, 'in_progress');
  nowMs += 61000;
  assert.equal((await store.begin({ user: 'u1', scope: 's', key: 'uuid-key-0001' })).action, 'run');
});

test('no header: no dedupe at all; bad header length: 400', async () => {
  const mw = buildMiddleware(createIdempotency(fakeModel()), 'POST x');
  let runs = 0;
  const handler = (req, res) => { runs += 1; res.status(200).json({ ok: true }); };
  await call(mw, { key: undefined, handler });
  await call(mw, { key: undefined, handler });
  assert.equal(runs, 2);
  const bad = await call(mw, { key: 'short', handler });
  assert.equal(bad.status, 400);
});

test('if the dedupe store itself is down the request still runs (a safety request is never blocked)', async () => {
  const broken = { begin: async () => { throw new Error('mongo down'); } };
  const mw = buildMiddleware(broken, 'POST x');
  let runs = 0;
  await call(mw, { key: 'uuid-key-0001', handler: (req, res) => { runs += 1; res.status(200).json({}); } });
  assert.equal(runs, 1);
});
