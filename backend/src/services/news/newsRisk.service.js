const { incidentKeywords } = require('../../config/newsKeywords');

/**
 * Purpose of this service:
 * Analyze news article titles and descriptions for incident-related keywords and
 * derive a reusable risk score for the environmental module.
 *
 * Why this exists:
 * The final danger zone engine will later consume a single news risk object, but the
 * environmental module only needs to emit this intermediate signal.
 */
const normalizeKeywords = (matchedKeywords = []) => {
  return [...new Set(matchedKeywords.map((item) => item.keyword).filter(Boolean))];
};

const scoreLevel = (score) => {
  if (score >= 80) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return 'LOW';
};

const severityLabel = (level) => {
  if (level === 'CRITICAL') return 'Critical incident';
  if (level === 'HIGH') return 'High incident';
  if (level === 'MEDIUM') return 'Moderate incident';
  return 'Minor incident';
};

const buildNewsRisk = ({ articles = [], location = 'Mumbai' }) => {
  const normalizedArticles = Array.isArray(articles) ? articles : [];
  const matchedEntries = [];

  normalizedArticles.forEach((article) => {
    const searchableText = `${article.title || ''} ${article.description || ''}`.toLowerCase();
    const matchedKeywords = incidentKeywords.filter((item) => searchableText.includes(item.keyword));

    if (matchedKeywords.length > 0) {
      matchedEntries.push({
        title: article.title || 'Untitled article',
        matchedKeywords: matchedKeywords.map((item) => item.keyword),
      });
    }
  });

  const matchedKeywords = normalizeKeywords(
    matchedEntries.flatMap((entry) => entry.matchedKeywords.map((keyword) => ({ keyword })))
  );

  let score = 0;
  matchedKeywords.forEach((keyword) => {
    const definition = incidentKeywords.find((item) => item.keyword === keyword);
    if (definition) {
      score += definition.weight;
    }
  });

  score = Math.min(100, Math.round(score + matchedEntries.length * 4));
  const level = scoreLevel(score);

  return {
    score,
    level,
    matchedKeywords,
    summary: matchedKeywords.length > 0
      ? `${severityLabel(level)} detected near ${location}.`
      : `No urgent incident keywords detected near ${location}.`,
    articlesConsidered: normalizedArticles.length,
    incidentCount: matchedEntries.length,
    incidentSeverity: severityLabel(level),
  };
};

module.exports = {
  buildNewsRisk,
};
