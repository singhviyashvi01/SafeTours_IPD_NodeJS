const test = require('node:test');
const assert = require('node:assert/strict');
const flow = require('./proposalFlow');
const { capHistory, turnsForServer, LIMITS } = require('./chatLogic');
const rules = require('./assistantRules');

const proposal = { incidentType: 'Harassment', description: 'Men harassing women near the bus stop' };

// ── report proposal flow: never submitted without confirmation ──────────────────────
test('a proposal alone never calls the report API', async () => {
  let calls = 0;
  const state = flow.create(proposal);
  const out = await flow.submit(state, async () => { calls += 1; return { success: true }; });
  assert.equal(calls, 0);
  assert.equal(out.called, false);
  assert.equal(out.state.status, 'proposed');
});

test('only after Confirm is the report sent, exactly once, with the proposed values', async () => {
  const seen = [];
  const send = async (p) => { seen.push(p); return { success: true }; };
  let state = flow.confirm(flow.create(proposal));
  assert.equal(state.status, 'confirming');
  const a = await flow.submit(state, send);
  assert.equal(a.called, true);
  assert.equal(a.state.status, 'submitted');
  // a second tap on the same card finds a finished state and sends nothing
  const again = await flow.submit(a.state, send);
  assert.equal(again.called, false);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0], proposal);
});

test('a queued (offline) report is reported as queued, not as submitted', async () => {
  const out = await flow.submit(flow.confirm(flow.create(proposal)), async () => ({ success: true, queued: true }));
  assert.equal(out.state.status, 'queued');
});

test('dismiss ends the flow and nothing can be sent afterwards', async () => {
  let calls = 0;
  const state = flow.dismiss(flow.create(proposal));
  assert.equal(state.status, 'dismissed');
  assert.equal(flow.confirm(state).status, 'dismissed'); // cannot be revived
  const out = await flow.submit(flow.confirm(state), async () => { calls += 1; return { success: true }; });
  assert.equal(calls, 0);
  assert.equal(out.called, false);
});

test('a failed send returns to a state the user can confirm again; the error is kept', async () => {
  const failed = await flow.submit(flow.confirm(flow.create(proposal)), async () => ({ success: false, error: { message: 'Report limit reached' } }));
  assert.equal(failed.state.status, 'failed');
  assert.equal(failed.state.error, 'Report limit reached');
  assert.equal(flow.confirm(failed.state).status, 'confirming');
  const thrown = await flow.submit(flow.confirm(flow.create(proposal)), async () => { throw new Error('boom'); });
  assert.equal(thrown.state.status, 'failed');
});

// ── chat history on the device ───────────────────────────────────────────────────
test('history is capped by message count and by size, oldest dropped first', () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ id: i, role: 'user', text: `message ${i}` }));
  const capped = capHistory(many);
  assert.equal(capped.length, LIMITS.maxMessages);
  assert.equal(capped[capped.length - 1].id, 199);

  const big = Array.from({ length: 30 }, (_, i) => ({ id: i, role: 'assistant', text: 'x'.repeat(5000) }));
  const bySize = capHistory(big);
  assert.ok(bySize.length < 30);
  assert.equal(bySize[bySize.length - 1].id, 29);
});

test('only the last few plain turns go to the server; errors and pending messages never do', () => {
  const msgs = [
    ...Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: `t${i}` })),
    { role: 'assistant', text: 'failed', error: true },
    { role: 'user', text: 'pending', pending: true },
  ];
  const turns = turnsForServer(msgs);
  assert.equal(turns.length, LIMITS.sendTurns);
  assert.ok(turns.every((t) => t.text !== 'failed' && t.text !== 'pending'));
  assert.equal(turns[turns.length - 1].text, 't9');
});

// ── offline answers on the phone use the shared rules ───────────────────────────
test('offline: the rule-based answer works from cached context alone and says it is saved data', () => {
  const ctx = {
    source: 'device',
    fetchedAt: new Date(Date.now() - 30 * 60000).toISOString(),
    risk: { level: 'LOW', score: 28, topFactor: 'crowd', dataConfidence: 0.8, demo: false, lowConfidence: false, missing: [], stale: [] },
    nearby: { status: 'ok', stale: true, nearest: { hospital: [{ name: 'Saved Hospital', distance: 900, phone: null }], police: [] } },
    weather: null,
    community: null,
  };
  const a = rules.answerFromContext('nearest hospital', ctx);
  assert.match(a.text, /Saved Hospital/);
  assert.match(a.text, /saved on your phone/);
  assert.match(a.text, /112/);
  assert.match(rules.answerFromContext('what is the weather', ctx).text, /do not have weather data/i);
});

test('offline report proposals are rule based and still need confirmation', () => {
  const p = rules.proposeReportFromText("there's harassment near the bus stop", ['Harassment', 'Theft', 'Other']);
  assert.equal(p.incidentType, 'Harassment');
  assert.equal(flow.create(p).status, 'proposed');
  assert.equal(rules.proposeReportFromText('is it safe here?', ['Harassment']), null);
  assert.equal(rules.proposeReportFromText('there is a fire', ['Harassment']), null); // category not offered
});
