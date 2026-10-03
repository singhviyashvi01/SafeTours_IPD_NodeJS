const newsCfg = require('../../config/news.config');

/**
 * Decides whether an article reports a hazard event and how severe it is.
 * Phrase-level rules (not bare keywords), per-hazard exclusions, a negation window, and a whole-
 * article skip for drills/films. Returns the strongest valid hazard, or null.
 */
function classifyArticle({ title = '', description = '' }, cfg = newsCfg) {
  const text = `${title}. ${description}`;
  if (cfg.nonEvent.test(title)) return null;

  let best = null;
  for (const hazard of cfg.hazards) {
    if (hazard.exclude.some((rx) => rx.test(text))) continue;

    for (const pattern of hazard.patterns) {
      const rx = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      let m;
      while ((m = rx.exec(text)) !== null) {
        const window = text.slice(Math.max(0, m.index - 35), m.index);
        if (cfg.negation.test(window)) continue;
        if (!best || hazard.severity > best.severity) {
          best = { hazard: hazard.key, severity: hazard.severity, phrase: m[0] };
        }
        break;
      }
    }
  }
  return best;
}

module.exports = { classifyArticle };
