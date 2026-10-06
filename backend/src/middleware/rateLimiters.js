const rateLimit = require('express-rate-limit');

/**
 * Per-USER rate limiter (keyed by the verified user id, so it must run after verifyJWT).
 * The global per-IP limiter in app.js still applies on top.
 * NOTE: counters are kept in this process's memory. With several server instances use a shared
 * store (e.g. rate-limit-redis); a single instance is fine.
 */
function userLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user?._id || 'anonymous'),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message },
  });
}

module.exports = {
  userLimiter,
  // all /api/sos/* calls (polling /pending included)
  sosGeneral: userLimiter({ windowMs: 60 * 1000, limit: 120, message: 'Too many SOS requests, slow down.' }),
  // creating SOS records: a human cannot legitimately need more
  sosCreate: userLimiter({ windowMs: 60 * 1000, limit: 6, message: 'Too many SOS requests. If this is an emergency call your local emergency number.' }),
  // community reports: anti-spam
  communityReport: userLimiter({ windowMs: 60 * 60 * 1000, limit: 10, message: 'Report limit reached (10 per hour). Please try again later.' }),
  // nearby places: the app refreshes only on a new cell / >1 km, so 20 per minute is generous
  nearby: userLimiter({ windowMs: 60 * 1000, limit: 20, message: 'Too many nearby-services requests, slow down.' }),
  // geofence checks: the app throttles to ~1 per 30 s, allow headroom for retries
  geofence: userLimiter({ windowMs: 60 * 1000, limit: 30, message: 'Too many location checks, slow down.' }),
};
