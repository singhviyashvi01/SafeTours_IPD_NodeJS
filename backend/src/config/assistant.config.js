/**
 * assistant.config.js: the AI safety assistant (POST /api/assistant/chat).
 *
 * GEMINI_API_KEY and GEMINI_MODEL come from .env. The model name below is only the default used when
 * GEMINI_MODEL is unset; Google renames and retires models, so set GEMINI_MODEL explicitly and check
 * https://ai.google.dev/gemini-api/docs/models before a demo.
 */
const num = (name, fallback) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

module.exports = {
  gemini: {
    // Read at call time through getters so tests and .env reloads see current values.
    get apiKey() {
      return process.env.GEMINI_API_KEY || '';
    },
    get model() {
      return process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    },
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    timeoutMs: num('GEMINI_TIMEOUT_MS', 12000),
    temperature: 0.3,
    maxOutputTokens: 700,
  },

  // Request limits
  maxMessageChars: 500,
  maxHistoryTurns: 8,
  maxHistoryChars: 400, // per turn

  // Context limits (untrusted text is always truncated)
  context: {
    communityRadiusM: 1500,
    maxIncidents: 5,
    incidentTextChars: 140,
    nearbyRadiusM: 3000,
    perPartTimeoutMs: 4000,
  },

  // Per-user rate limits (see middleware/rateLimiters.js)
  rateLimit: {
    perMinute: num('ASSISTANT_PER_MINUTE', 10),
    perHour: num('ASSISTANT_PER_HOUR', 60),
  },

  proposal: { descriptionMin: 5, descriptionMax: 300 },
};
