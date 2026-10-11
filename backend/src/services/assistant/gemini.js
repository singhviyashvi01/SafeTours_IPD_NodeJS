const cfg = require('../../config/assistant.config');

/**
 * Minimal Gemini REST client (generateContent). No SDK, no logging of prompts or answers.
 *
 *   POST {baseUrl}/models/{model}:generateContent        header: x-goog-api-key
 *   body: { systemInstruction, contents, generationConfig:{ temperature, maxOutputTokens, responseMimeType } }
 *   reply text: candidates[0].content.parts[].text
 *
 * Failure modes are mapped to GeminiError codes so the caller can fall back to the rule-based answer:
 *   no_key | timeout | network | http_<status> | blocked | empty
 */
class GeminiError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

/**
 * @param {{systemInstruction:Object, contents:Array}} request
 * @param {{fetchImpl?:Function, apiKey?:string, model?:string, timeoutMs?:number}} [opts]
 * @returns {Promise<{text:string, model:string, latencyMs:number}>}
 */
async function generate(request, opts = {}) {
  const apiKey = opts.apiKey !== undefined ? opts.apiKey : cfg.gemini.apiKey;
  const model = opts.model || cfg.gemini.model;
  const timeoutMs = opts.timeoutMs || cfg.gemini.timeoutMs;
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (!apiKey) throw new GeminiError('no_key', 'GEMINI_API_KEY is not configured');
  if (typeof fetchImpl !== 'function') throw new GeminiError('network', 'fetch is not available');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  let res;
  try {
    res = await fetchImpl(`${cfg.gemini.baseUrl}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: request.systemInstruction,
        contents: request.contents,
        generationConfig: {
          temperature: cfg.gemini.temperature,
          maxOutputTokens: cfg.gemini.maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e && e.name === 'AbortError') throw new GeminiError('timeout', `Gemini did not answer within ${timeoutMs} ms`);
    throw new GeminiError('network', 'Could not reach Gemini');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new GeminiError(`http_${res.status}`, `Gemini returned HTTP ${res.status}`);

  let body;
  try {
    body = await res.json();
  } catch (e) {
    throw new GeminiError('empty', 'Gemini returned an unreadable body');
  }
  if (body && body.promptFeedback && body.promptFeedback.blockReason) throw new GeminiError('blocked', `blocked: ${body.promptFeedback.blockReason}`);
  const cand = body && body.candidates && body.candidates[0];
  const text = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts.map((p) => p.text || '').join('').trim() : '';
  if (!text) throw new GeminiError(cand && cand.finishReason && cand.finishReason !== 'STOP' ? 'blocked' : 'empty', 'Gemini returned no text');
  return { text, model, latencyMs: Date.now() - started };
}

module.exports = { generate, GeminiError };
