const test = require('node:test');
const assert = require('node:assert/strict');
const { createModel, reduce, pendingDelay } = require('./connectivityMachine');
const { connectivity: cfg } = require('./offlineConfig');

const T0 = 1_000_000;
const run = (events, model = createModel()) => events.reduce((m, [e, at]) => reduce(m, e, T0 + at * 1000, cfg), model);
const online = { type: 'net', connected: true, reachable: true, netType: 'wifi' };
const offline = { type: 'net', connected: false, reachable: false, netType: 'none' };
const pingOk = (ms = 120) => ({ type: 'ping', ok: true, ms });
const pingFail = { type: 'ping', ok: false };

test('the first resolved state applies immediately (no debounce at startup)', () => {
  assert.equal(run([[offline, 0]]).state, 'OFFLINE');
  assert.equal(run([[online, 0], [pingOk(), 0]]).state, 'ONLINE');
});

test('going offline is debounced: a 1 s blip does not change the state', () => {
  const m = run([[online, 0], [pingOk(), 0], [offline, 10], [online, 11], [{ type: 'tick' }, 20]]);
  assert.equal(m.state, 'ONLINE');
});

test('a drop that lasts longer than the debounce becomes OFFLINE; recovery needs its own debounce', () => {
  let m = run([[online, 0], [pingOk(), 0], [offline, 10], [{ type: 'tick' }, 12]]);
  assert.equal(m.state, 'ONLINE'); // 2 s < 3 s
  m = reduce(m, { type: 'tick' }, T0 + 13_500, cfg);
  assert.equal(m.state, 'OFFLINE');
  m = reduce(m, online, T0 + 20_000, cfg);
  assert.equal(m.state, 'OFFLINE'); // recovery not yet debounced
  assert.equal(pendingDelay(m, T0 + 20_000, cfg), cfg.recoverDebounceMs);
  m = reduce(m, { type: 'tick' }, T0 + 25_500, cfg);
  assert.equal(m.state, 'ONLINE');
});

test('rapid flapping never reaches the UI', () => {
  let m = run([[online, 0], [pingOk(), 0]]);
  for (let i = 1; i <= 20; i += 1) m = reduce(m, i % 2 ? offline : online, T0 + i * 1000, cfg);
  assert.equal(m.state, 'ONLINE');
});

test('connected but the backend ping fails twice: OFFLINE (isConnected alone is not trusted)', () => {
  let m = run([[online, 0], [pingOk(), 0], [pingFail, 30]]);
  assert.equal(m.pending?.to, 'WEAK'); // one failed ping = WEAK candidate
  m = run([[pingFail, 40], [{ type: 'tick' }, 44]], m);
  assert.equal(m.pending?.to ?? m.state, 'OFFLINE');
  m = reduce(m, { type: 'tick' }, T0 + 48_000, cfg);
  assert.equal(m.state, 'OFFLINE');
  assert.deepEqual(m.reasons, ['server unreachable']);
});

test('WEAK: a recent failed or slow API request, slow ping, or 2G', () => {
  const base = [[online, 0], [pingOk(), 0]];
  let m = run([...base, [{ type: 'request', ok: false, ms: 900 }, 10], [{ type: 'tick' }, 14]]);
  assert.equal(m.state, 'WEAK');
  assert.deepEqual(m.reasons, ['recent request failed']);

  m = run([...base, [{ type: 'request', ok: true, ms: cfg.slowRequestMs + 1 }, 10], [{ type: 'tick' }, 14]]);
  assert.equal(m.state, 'WEAK');
  assert.deepEqual(m.reasons, ['slow request']);

  m = run([[online, 0], [pingOk(cfg.slowPingMs + 500), 0], [{ type: 'tick' }, 5]], run([[online, 0], [pingOk(), 0]]));
  assert.equal(m.state, 'WEAK');

  m = run([[{ ...online, netType: 'cellular', generation: '2g' }, 0], [pingOk(), 0]]);
  assert.equal(m.state, 'WEAK');
  assert.deepEqual(m.reasons, ['2G cellular']);
  assert.equal(run([[{ ...online, netType: 'cellular', generation: '4g' }, 0], [pingOk(), 0]]).state, 'ONLINE');
});

test('WEAK clears after the weak window with no new failures (plus recovery debounce)', () => {
  let m = run([[online, 0], [pingOk(), 0], [{ type: 'request', ok: false, ms: 500 }, 10], [{ type: 'tick' }, 14]]);
  assert.equal(m.state, 'WEAK');
  m = reduce(m, pingOk(), T0 + 80_000, cfg); // failure is now older than weakWindowMs (60 s)
  assert.equal(m.pending?.to, 'ONLINE');
  m = reduce(m, { type: 'tick' }, T0 + 86_000, cfg);
  assert.equal(m.state, 'ONLINE');
});

test('a successful ping resets the failure count', () => {
  let m = run([[online, 0], [pingOk(), 0], [pingFail, 30], [pingOk(), 40]]);
  assert.equal(m.ping.consecutiveFailures, 0);
});

test('forced offline (test mode) applies immediately, ignores a healthy network, and can be switched off', () => {
  let m = run([[online, 0], [pingOk(), 0], [{ type: 'force', value: true }, 5]]);
  assert.equal(m.state, 'OFFLINE');
  assert.deepEqual(m.reasons, ['offline mode is switched on (test)']);
  m = reduce(m, pingOk(), T0 + 6000, cfg);
  assert.equal(m.state, 'OFFLINE');
  m = reduce(m, { type: 'force', value: false }, T0 + 7000, cfg);
  assert.equal(m.state, 'ONLINE'); // leaving forced mode is immediate too
});

test('only the most recent N requests are kept', () => {
  let m = createModel();
  for (let i = 0; i < 20; i += 1) m = reduce(m, { type: 'request', ok: true, ms: 100 }, T0 + i, cfg);
  assert.equal(m.requests.length, cfg.recentRequests);
});
