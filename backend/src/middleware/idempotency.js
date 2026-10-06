const IdempotencyRecord = require('../models/IdempotencyRecord');
const { createIdempotency } = require('../services/idempotency');
const logger = require('../utils/logger');

/**
 * idempotent(scope): Express middleware for POSTs the offline outbox may re-send.
 *
 * With an `Idempotency-Key` header (8-128 chars) the request runs at most once per (user, scope, key):
 * a re-send returns the stored response with `Idempotent-Replay: true`. Without the header nothing changes.
 * Must run after verifyJWT. Place it BEFORE rate limiters so replays do not use up the quota.
 */
function buildMiddleware(store, scope) {
  return async function idempotent(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key) return next();
    if (key.length < 8 || key.length > 128) {
      return res.status(400).json({ success: false, message: 'Idempotency-Key must be 8-128 characters.' });
    }

    let begun;
    try {
      begun = await store.begin({ user: req.user._id, scope, key });
    } catch (e) {
      logger.error('[idempotency] store unavailable, running the request without dedupe', e);
      return next(); // never block a safety request because the dedupe store failed
    }

    if (begun.action === 'replay') {
      res.set('Idempotent-Replay', 'true');
      return res.status(begun.statusCode).json(begun.body);
    }
    if (begun.action === 'in_progress') {
      res.set('Retry-After', '2');
      return res.status(503).json({ success: false, message: 'The first request with this key is still being processed. Retry shortly.' });
    }

    // run: capture the response of the real handler
    let settled = false;
    const finish = (fn) => {
      if (settled) return;
      settled = true;
      fn().catch((e) => logger.error('[idempotency] could not update record', e));
    };
    const json = res.json.bind(res);
    res.json = (body) => {
      const code = res.statusCode;
      if (code >= 200 && code < 300) finish(() => store.complete(begun.id, code, body));
      else finish(() => store.abort(begun.id));
      return json(body);
    };
    res.on('close', () => {
      if (!res.writableEnded) finish(() => store.abort(begun.id)); // client went away: allow a retry
    });
    return next();
  };
}

const idempotent = (scope) => buildMiddleware(createIdempotency(IdempotencyRecord), scope);

module.exports = { idempotent, buildMiddleware };
