const test = require('node:test');
const assert = require('node:assert/strict');
const h3 = require('h3-js');
const { scoreCells, incidentWeight } = require('./communityComponent');

const NOW = new Date('2026-10-03T06:30:00Z');
const cell = h3.latLngToCell(19.076, 72.8777, 9);
const [neighbor] = h3.gridDisk(cell, 1).filter((c) => c !== cell);
const inc = (over = {}) => ({
  incidentType: 'Harassment',
  h3CellId: cell,
  createdAt: new Date(NOW.getTime() - 60 * 60000), // 1h ago
  expiresAt: new Date(NOW.getTime() + 11 * 60 * 60000), // 12h life
  confirmationCount: 0,
  falseReportCount: 0,
  ...over,
});

test('a single unconfirmed report cannot spike a cell', () => {
  const s = scoreCells([cell], [inc()], NOW)[cell];
  assert.ok(s > 0 && s < 25, `got ${s}`);
});

test('confirmations raise the score, false reports lower it', () => {
  const base = scoreCells([cell], [inc()], NOW)[cell];
  const confirmed = scoreCells([cell], [inc({ confirmationCount: 3 })], NOW)[cell];
  const disputed = scoreCells([cell], [inc({ confirmationCount: 3, falseReportCount: 2 })], NOW)[cell];
  assert.ok(confirmed > base);
  assert.ok(disputed < confirmed);
});

test('incidents fade to zero as they expire', () => {
  const nearlyExpired = inc({ expiresAt: new Date(NOW.getTime() + 60000) });
  const expired = inc({ expiresAt: new Date(NOW.getTime() - 1000) });
  assert.ok(incidentWeight(nearlyExpired, NOW) < incidentWeight(inc(), NOW) / 10);
  assert.equal(incidentWeight(expired, NOW), 0);
});

test('neighbouring cells inherit half-weight risk; far cells get none', () => {
  const far = h3.gridDisk(cell, 3).filter((c) => !h3.gridDisk(cell, 2).includes(c))[0];
  const s = scoreCells([cell, neighbor, far], [inc({ confirmationCount: 3 })], NOW);
  assert.ok(s[neighbor] > 0 && s[neighbor] < s[cell]);
  assert.equal(s[far], 0);
});

test('score saturates below 100', () => {
  const many = Array.from({ length: 20 }, () => inc({ incidentType: 'Assault', confirmationCount: 5 }));
  assert.ok(scoreCells([cell], many, NOW)[cell] <= 100);
});
