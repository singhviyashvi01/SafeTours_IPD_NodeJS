'use strict';

/**
 * Chat history rules (pure): what the phone keeps and what it sends to the server.
 * History lives on the device only, capped in messages and in size.
 */
const LIMITS = { maxMessages: 60, maxBytes: 48 * 1024, sendTurns: 6, sendChars: 400 };

const sizeOf = (m) => (m.text ? m.text.length : 0) + 64;

/** Newest messages that fit the message and size caps (oldest are dropped first). */
function capHistory(messages, limits = LIMITS) {
  const kept = [];
  let bytes = 0;
  for (let i = messages.length - 1; i >= 0 && kept.length < limits.maxMessages; i -= 1) {
    const size = sizeOf(messages[i]);
    if (bytes + size > limits.maxBytes) break;
    bytes += size;
    kept.unshift(messages[i]);
  }
  return kept;
}

/** The last few turns, as plain {role,text}, for the server. Errors and pending messages are not sent. */
function turnsForServer(messages, limits = LIMITS) {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.text && !m.error && !m.pending)
    .slice(-limits.sendTurns)
    .map((m) => ({ role: m.role, text: m.text.slice(0, limits.sendChars) }));
}

module.exports = { LIMITS, capHistory, turnsForServer };
