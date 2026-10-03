const h3 = require('h3-js');
const newsCfg = require('../../config/news.config');
const { classifyArticle } = require('./newsClassifier');
const { extractGazetteerLocations, extractCandidates } = require('./locationExtractor');

/**
 * News pipeline (pure apart from the injected `geocode`):
 *   article -> hazard? (phrase rules) -> location? (gazetteer, else geocoded candidates)
 *           -> severity x time decay -> matched cell + 6 neighbours -> saturating score per cell
 * An article without a hazard, without an extractable location, or older than maxAgeHours
 * contributes nothing. There is no city-wide fallback.
 */

const H3_RES = 9;

async function locate(article, geocode, cfg) {
  const inTitle = extractGazetteerLocations(article.title);
  if (inTitle.length) return { ...inTitle[0], field: 'title' };

  const inBody = extractGazetteerLocations(article.description);
  if (inBody.length) return { ...inBody[0], field: 'description' };

  const candidates = [
    ...extractCandidates(article.title).map((c) => ({ c, field: 'title' })),
    ...extractCandidates(article.description).map((c) => ({ c, field: 'description' })),
  ].slice(0, cfg.geocode.maxCandidatesPerArticle);

  for (const { c, field } of candidates) {
    const hit = geocode ? await geocode(c) : null;
    if (hit) return { name: c, lat: hit.latitude, lng: hit.longitude, source: 'geocoded', field };
  }
  return null;
}

/**
 * @param {Array<{title,description,publishedAt,source}>} articles
 * @param {{now?:Date, geocode?:(name:string)=>Promise<{latitude,longitude}|null>, cfg?:Object}} opts
 * @returns {{scores:Object, itemsByCell:Object, stats:Object}}
 */
async function buildNewsScores(articles, { now = new Date(), geocode, cfg = newsCfg } = {}) {
  const stats = { articles: articles.length, notHazard: 0, noLocation: 0, tooOld: 0, noDate: 0, counted: 0 };
  const rawByCell = new Map();
  const itemsByCell = {};

  for (const article of articles) {
    const published = article.publishedAt ? Date.parse(article.publishedAt) : NaN;
    if (Number.isNaN(published)) {
      stats.noDate += 1; // cannot apply time decay without a date
      continue;
    }
    const ageHours = (now.getTime() - published) / 3600000;
    if (ageHours > cfg.maxAgeHours) {
      stats.tooOld += 1;
      continue;
    }

    const cls = classifyArticle(article, cfg);
    if (!cls) {
      stats.notHazard += 1;
      continue;
    }

    const where = await locate(article, geocode, cfg);
    if (!where) {
      stats.noLocation += 1;
      continue;
    }

    const decay = Math.pow(0.5, Math.max(0, ageHours) / cfg.halfLifeHours);
    const fieldFactor = where.field === 'description' ? cfg.descriptionLocationFactor : 1;
    const value = cls.severity * decay * fieldFactor;
    const cell = h3.latLngToCell(where.lat, where.lng, H3_RES);

    rawByCell.set(cell, (rawByCell.get(cell) || 0) + value);
    (itemsByCell[cell] = itemsByCell[cell] || []).push({
      title: article.title,
      hazard: cls.hazard,
      location: where.name,
      locationSource: where.source,
      source: article.source,
      publishedAt: article.publishedAt,
      contribution: Math.round(value * 10) / 10,
    });
    stats.counted += 1;
  }

  // Matched cell at full weight, its six neighbours at neighbourFactor. Nothing further.
  const raw = new Map();
  for (const [cell, value] of rawByCell) {
    for (const c of h3.gridDisk(cell, 1)) {
      raw.set(c, (raw.get(c) || 0) + (c === cell ? value : value * cfg.neighbourFactor));
    }
  }

  const scores = {};
  for (const [cell, value] of raw) {
    scores[cell] = Math.round(100 * (1 - Math.exp(-value / cfg.saturation)) * 10) / 10;
  }
  return { scores, itemsByCell, stats };
}

module.exports = { buildNewsScores };
