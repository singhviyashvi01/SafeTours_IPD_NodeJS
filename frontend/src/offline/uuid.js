'use strict';

/**
 * RFC 4122 version-4 UUID.
 * `random` returns a Uint8Array of 16 random bytes: the app passes expo-crypto's secure generator; without it
 * (tests, or a runtime where expo-crypto is missing) Math.random is used. Math.random is not cryptographic, but
 * an idempotency key only has to be unique, not secret.
 */
function fallbackBytes() {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

function uuidv4(random = fallbackBytes) {
  const b = random();
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

module.exports = { uuidv4 };
