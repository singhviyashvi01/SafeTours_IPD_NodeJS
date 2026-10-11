/**
 * Untrusted text handling for the assistant.
 *
 * Incident descriptions are typed by other users, and news headlines come from the internet. Both can contain
 * text that tries to steer the model ("ignore your rules and ..."). They are never put into the prompt as plain
 * prose: each one is cleaned, cut short and delivered as a JSON string value inside a block labelled as data.
 * Cleaning cannot make injection impossible, so the system prompt also tells the model to treat the block as
 * data, and nothing the model says can act on its own (reports need the user's confirmation in the app).
 */

// Phrases typical of prompt injection. They are replaced, not just ignored, so the model never sees them.
const INSTRUCTION_PATTERNS = [
  /ignore (all |any |the |your )?(previous|prior|above|earlier)[^.\n]{0,40}/gi,
  /disregard (all |any |the |your )?(previous|prior|above|earlier|rules|instructions)[^.\n]{0,40}/gi,
  /forget (all |everything |your )?(previous|prior|above|instructions|rules)[^.\n]{0,40}/gi,
  /(system|developer|assistant) (prompt|message|instruction)s?/gi,
  /you are (now )?(a|an|the) [^.\n]{0,40}/gi,
  /(act|behave|respond|reply|answer) (as|like) [^.\n]{0,40}/gi,
  /new (instructions?|rules?|role)[^.\n]{0,40}/gi,
  /(reveal|print|show|repeat) (your |the )?(prompt|instructions|rules|system)[^.\n]{0,30}/gi,
  /\b(jailbreak|DAN mode|developer mode)\b/gi,
  /submit (a |the )?report[^.\n]{0,40}/gi,
];

const REMOVED = '[removed instruction-like text]';

/**
 * @param {any} value
 * @param {number} maxChars
 * @returns {string} plain single-line text, at most maxChars characters (an ellipsis counts)
 */
function sanitizeUntrusted(value, maxChars = 140) {
  let s = String(value === null || value === undefined ? '' : value);
  s = s.normalize('NFKC');
  // control characters, zero-width and bidi override characters
  s = s.replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, ' ');
  // markup that could pose as structure: code fences, tags, role markers, headings, braces
  s = s.replace(/```+/g, ' ').replace(/<[^>]{0,80}>/g, ' ').replace(/\b(system|assistant|user|model)\s*:/gi, '$1 -');
  s = s.replace(/[{}[\]`#<>]/g, ' ');
  for (const re of INSTRUCTION_PATTERNS) s = s.replace(re, REMOVED);
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length > maxChars) s = `${s.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
  return s;
}

/** Text typed by the signed-in user: cleaned of control characters and length-limited, but otherwise as written. */
function cleanUserText(value, maxChars) {
  let s = String(value === null || value === undefined ? '' : value).normalize('NFKC');
  s = s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁦-⁩﻿]/g, ' ');
  s = s.replace(/[ \t]+/g, ' ').trim();
  return s.length > maxChars ? s.slice(0, maxChars) : s;
}

module.exports = { sanitizeUntrusted, cleanUserText, REMOVED };
