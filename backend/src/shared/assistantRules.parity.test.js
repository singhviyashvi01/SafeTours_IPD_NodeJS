const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const FRONT = path.resolve(__dirname, '../../../frontend/src/offline/assistantRules.js');
const present = fs.existsSync(FRONT);
const norm = (s) => s.replace(/\r\n/g, '\n');

test('the phone copy of assistantRules.js is byte-identical to the backend source (run: npm run sync:device-core)', { skip: !present }, () => {
  const a = norm(fs.readFileSync(path.join(__dirname, 'assistantRules.js'), 'utf8'));
  const b = norm(fs.readFileSync(FRONT, 'utf8'));
  assert.equal(b, a, 'frontend/src/offline/assistantRules.js differs from backend/src/shared/assistantRules.js');
});

test('the shared rules give the same answer from the same context on both sides', { skip: !present }, () => {
  const server = require('./assistantRules');
  const device = require(FRONT);
  const ctx = {
    source: 'device',
    fetchedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    risk: { level: 'MODERATE', score: 47, topFactor: 'crowd', demo: true, lowConfidence: true, missing: ['weather'], stale: [] },
    nearby: { status: 'ok', stale: true, nearest: { hospital: [{ name: 'H', distance: 1500, phone: '+91 1' }], police: [] } },
    community: { count: 2 },
  };
  for (const q of ['is it safe', 'nearest hospital', 'police', 'what now', 'weather', 'anything reported nearby', 'hello']) {
    assert.deepEqual(device.answerFromContext(q, ctx), server.answerFromContext(q, ctx));
  }
  assert.deepEqual(device.homeTips(ctx), server.homeTips(ctx));
});
