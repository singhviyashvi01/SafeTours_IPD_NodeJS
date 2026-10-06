'use strict';

/**
 * Connectivity state machine (pure, time is passed in so it is deterministic and testable).
 *
 *   OFFLINE   no network, or the server cannot be reached (repeated failed pings), or "forced offline"
 *   WEAK      connected but a recent request failed / was slow, the last ping failed or was slow, or 2G
 *   ONLINE    everything else
 *
 * isConnected alone is not trusted: a backend ping confirms reachability. State changes are debounced
 * (a worse state must persist degradeDebounceMs, a better one recoverDebounceMs) so it does not flap.
 * The first resolved state, and a forced change, apply immediately.
 */

const RANK = { ONLINE: 0, WEAK: 1, OFFLINE: 2 };

function createModel() {
  return {
    state: 'ONLINE',
    reasons: [],
    since: null,
    initialized: false,
    pending: null, // { to, since }
    forced: false,
    net: { connected: null, reachable: null, type: null, generation: null },
    ping: { lastOk: null, lastMs: null, consecutiveFailures: 0, lastAt: null },
    requests: [], // { at, ok, ms }
  };
}

/** What the inputs say right now, ignoring debounce. */
function evaluate(model, now, cfg) {
  if (model.forced) return { target: 'OFFLINE', reasons: ['offline mode is switched on (test)'] };
  const { net, ping } = model;
  if (net.connected === false || net.reachable === false) return { target: 'OFFLINE', reasons: ['no network connection'] };
  if (ping.consecutiveFailures >= cfg.pingFailuresForOffline) return { target: 'OFFLINE', reasons: ['server unreachable'] };

  const reasons = [];
  if (ping.consecutiveFailures > 0) reasons.push('last ping failed');
  if (ping.lastOk && ping.lastMs !== null && ping.lastMs > cfg.slowPingMs) reasons.push('slow ping');
  const recent = model.requests.filter((r) => now - r.at <= cfg.weakWindowMs);
  if (recent.some((r) => !r.ok)) reasons.push('recent request failed');
  if (recent.some((r) => r.ok && r.ms > cfg.slowRequestMs)) reasons.push('slow request');
  if (net.generation && cfg.weakCellularGenerations.includes(String(net.generation).toLowerCase())) reasons.push('2G cellular');

  return reasons.length ? { target: 'WEAK', reasons } : { target: 'ONLINE', reasons: [] };
}

function settle(model, now, cfg, immediate) {
  const { target, reasons } = evaluate(model, now, cfg);
  const next = { ...model, reasons };

  if (!model.initialized) {
    return { ...next, state: target, since: now, initialized: true, pending: null };
  }
  if (target === model.state) return { ...next, pending: null };
  if (immediate) return { ...next, state: target, since: now, pending: null };

  const pending = model.pending && model.pending.to === target ? model.pending : { to: target, since: now };
  const wait = RANK[target] > RANK[model.state] ? cfg.degradeDebounceMs : cfg.recoverDebounceMs;
  if (now - pending.since >= wait) return { ...next, state: target, since: now, pending: null };
  return { ...next, pending };
}

/**
 * @param {Object} model
 * @param {{type:'net'|'ping'|'request'|'force'|'tick', ...}} event
 * @param {number} now ms
 * @param {Object} cfg offlineConfig.connectivity
 */
function reduce(model, event, now, cfg) {
  let m = model;
  let immediate = false;
  switch (event.type) {
    case 'net':
      m = { ...m, net: { connected: event.connected ?? null, reachable: event.reachable ?? null, type: event.netType ?? null, generation: event.generation ?? null } };
      break;
    case 'ping':
      m = {
        ...m,
        ping: event.ok
          ? { lastOk: now, lastMs: event.ms ?? null, consecutiveFailures: 0, lastAt: now }
          : { ...m.ping, consecutiveFailures: m.ping.consecutiveFailures + 1, lastAt: now },
      };
      break;
    case 'request': {
      const requests = [...m.requests, { at: now, ok: Boolean(event.ok), ms: event.ms ?? 0 }].slice(-cfg.recentRequests);
      m = { ...m, requests };
      // A successful ping is stronger evidence of reachability than an old failed request: nothing else to do.
      break;
    }
    case 'force':
      m = { ...m, forced: Boolean(event.value) };
      immediate = true;
      break;
    case 'tick':
      break;
    default:
      return model;
  }
  return settle(m, now, cfg, immediate);
}

/** ms until a pending change would be applied (null when nothing is pending). */
function pendingDelay(model, now, cfg) {
  if (!model.pending) return null;
  const wait = RANK[model.pending.to] > RANK[model.state] ? cfg.degradeDebounceMs : cfg.recoverDebounceMs;
  return Math.max(0, model.pending.since + wait - now);
}

module.exports = { createModel, reduce, evaluate, pendingDelay, RANK };
