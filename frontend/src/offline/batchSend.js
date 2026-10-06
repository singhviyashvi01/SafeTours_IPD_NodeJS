'use strict';

/**
 * Sends a batch, and when the server rejects it with a 4xx (a "poison" item inside), splits it in halves until
 * the bad item is isolated. One malformed point must not block 99 good ones forever.
 *
 * @param {Array} items
 * @param {(items:Array)=>Promise<{kind:'sent'|'retry'|'dead', error?:string, retryAfterMs?:number}>} send
 * @returns {Promise<Array<{item:any, kind:'sent'|'retry'|'dead', error?:string, retryAfterMs?:number}>>}
 *   same order as `items`.
 *   - 'retry' (network / 5xx / 429) is never split: the whole group is retried later.
 *   - A single item that is rejected is 'dead'.
 */
async function sendWithBisect(items, send) {
  if (items.length === 0) return [];
  const result = await send(items);
  if (result.kind !== 'dead' || items.length === 1) {
    return items.map((item) => ({ item, kind: result.kind, error: result.error, retryAfterMs: result.retryAfterMs }));
  }
  const mid = Math.ceil(items.length / 2);
  const left = await sendWithBisect(items.slice(0, mid), send);
  // If the first half hit a transient problem, stop: do not keep calling a struggling server.
  if (left.some((r) => r.kind === 'retry')) {
    const rest = items.slice(mid).map((item) => ({ item, kind: 'retry', error: 'postponed', retryAfterMs: 0 }));
    return [...left, ...rest];
  }
  const right = await sendWithBisect(items.slice(mid), send);
  return [...left, ...right];
}

module.exports = { sendWithBisect };
