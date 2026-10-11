const cfg = require('../../config/assistant.config');
const rules = require('../../shared/assistantRules');
const { buildContext } = require('./contextBuilder');
const { buildRequest } = require('./prompt');
const gemini = require('./gemini');
const { cleanUserText } = require('./sanitize');
const { proposalFor, ruleProposalFor } = require('./proposal');
const logger = require('../../utils/logger');

/**
 * Assistant orchestration: context -> Gemini -> checks -> answer, with a rule-based answer from the SAME context
 * whenever Gemini is unavailable or its answer fails a check.
 *
 * Privacy: message and answer text are never logged. Only metadata (source, failure code, latency, which context
 * parts were missing) is.
 * Safety: this service never files a report. It returns a *proposal*; the app files it after the user confirms.
 */

const ALLOWED_NUMBERS = [rules.EMERGENCY_NUMBER];

/** Gemini was asked for JSON; tolerate a code fence or plain text. */
function parseModelOutput(text) {
  let t = String(text || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === 'object') {
      return { reply: typeof obj.reply === 'string' ? obj.reply : '', reportProposal: obj.reportProposal || null };
    }
  } catch (e) {
    /* not JSON */
  }
  return { reply: t.startsWith('{') ? '' : t, reportProposal: null };
}

const digitsOnly = (s) => String(s).replace(/\D/g, '');

/**
 * Phone numbers in the reply that are not in the context (nearby places), not the emergency number and not
 * something the user typed. The model must never invent a number.
 */
function unverifiedNumbers(reply, ctx, userMessage) {
  const allowed = new Set(ALLOWED_NUMBERS.map(digitsOnly));
  const nearest = (ctx && ctx.nearby && ctx.nearby.nearest) || {};
  for (const list of Object.values(nearest)) for (const p of list) if (p.phone) allowed.add(digitsOnly(p.phone));
  const typed = digitsOnly(userMessage || '');
  const found = String(reply).match(/\+?\d[\d\s().-]{4,}\d/g) || [];
  return found
    .map(digitsOnly)
    .filter((d) => d.length >= 6 && !allowed.has(d) && !typed.includes(d) && ![...allowed].some((a) => a.length >= 6 && (d.endsWith(a) || a.endsWith(d))));
}

function contextSummary(ctx, unavailable) {
  return {
    riskLevel: ctx.risk ? ctx.risk.level : null,
    score: ctx.risk ? ctx.risk.score : null,
    topFactor: ctx.risk ? ctx.risk.topFactor : null,
    dataConfidence: ctx.risk ? ctx.risk.dataConfidence : null,
    demo: Boolean(ctx.risk && ctx.risk.demo),
    lowConfidence: Boolean(ctx.risk && ctx.risk.lowConfidence),
    h3Index: ctx.location ? ctx.location.h3Index : null,
    unavailable,
  };
}

/**
 * @param {{userId:any, message:string, history?:Array, location?:Object|null, connectivity?:string}} input
 * @param {{buildContext?:Function, generate?:Function, now?:()=>Date}} [deps]
 */
async function chat({ userId, message, history = [], location = null, connectivity = null }, deps = {}) {
  const build = deps.buildContext || buildContext;
  const generate = deps.generate || gemini.generate;
  const now = deps.now ? deps.now() : new Date();
  const text = cleanUserText(message, cfg.maxMessageChars);
  const started = Date.now();

  const { ctx, untrusted, unavailable } = await build({ userId, location, connectivity, now });

  try {
    const request = buildRequest({ ctx, untrusted, unavailable, history, message: text });
    const out = await generate(request);
    const parsed = parseModelOutput(out.text);
    const reply = cleanUserText(parsed.reply, 1200);
    if (!reply) throw new gemini.GeminiError('empty', 'no reply text');
    const bad = unverifiedNumbers(reply, ctx, text);
    if (bad.length) throw new gemini.GeminiError('unverified_number', 'reply contained a phone number that is not in the context');

    logger.info(`[assistant] source=gemini latencyMs=${out.latencyMs} unavailable=${unavailable.join(',') || '-'}`);
    return {
      reply,
      source: 'gemini',
      label: 'AI',
      reportProposal: proposalFor(text, parsed.reportProposal),
      degraded: null,
      context: contextSummary(ctx, unavailable),
    };
  } catch (error) {
    const code = error && error.code ? error.code : 'error';
    const answer = rules.answerFromContext(text, ctx);
    logger.info(`[assistant] source=rules reason=${code} totalMs=${Date.now() - started} unavailable=${unavailable.join(',') || '-'}`);
    return {
      reply: answer.text,
      source: 'rules',
      label: 'offline assistant',
      reportProposal: ruleProposalFor(text),
      degraded: code,
      context: contextSummary(ctx, unavailable),
    };
  }
}

module.exports = { chat, parseModelOutput, unverifiedNumbers, contextSummary };
