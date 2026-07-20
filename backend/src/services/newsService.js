const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Fetches recent news articles from the configured News API.
 * Uses NEWS_API_URL and NEWS_API_KEY. Supports multiple potential API formats
 * (like NewsData.io results or NewsAPI articles) for maximum interoperability.
 *
 * @param {string} [query='Mumbai'] - The search keyword query.
 * @returns {Promise<Object[]>} A list of normalized and deduplicated news articles.
 */
async function fetchNews(query = 'Mumbai') {
  const apiKey = process.env.NEWS_API_KEY;
  const apiUrl = process.env.NEWS_API_URL || 'https://newsdata.io/api/1/news';

  if (!apiKey) {
    logger.error('[newsService] NEWS_API_KEY is not defined in environment variables.');
    throw new Error('News API key is not configured.');
  }

  logger.info(`[newsService] Requesting news from ${apiUrl} for query "${query}"...`);

  try {
    const response = await axios.get(apiUrl, {
      params: {
        apikey: apiKey,      // NewsData.io format
        apiKey: apiKey,      // NewsAPI.org format
        q: query,
        country: 'in',
        language: 'en',
        size: 50,
      },
      timeout: 10000, // 10s timeout
    });

    // Support both NewsData.io (results) and NewsAPI.org (articles) response structures
    const data = response?.data;
    let rawArticles = [];

    if (data) {
      if (Array.isArray(data.results)) {
        rawArticles = data.results;
      } else if (Array.isArray(data.articles)) {
        rawArticles = data.articles;
      } else if (Array.isArray(data)) {
        rawArticles = data;
      }
    }

    logger.info(`[newsService] Received ${rawArticles.length} raw articles from News API.`);

    const seenTitles = new Set();
    const normalizedArticles = [];

    for (const article of rawArticles) {
      if (!article || !article.title) continue;

      const cleanTitle = article.title.trim().toLowerCase();
      if (seenTitles.has(cleanTitle)) {
        continue; // Deduplicate duplicate titles
      }
      seenTitles.add(cleanTitle);

      const normalized = {
        title: article.title.trim(),
        description: article.description || article.content || '',
        source: article.source_id || article.source?.name || article.source?.id || 'Unknown Source',
        publishedAt: article.pubDate || article.pub_date || article.publishedAt || new Date().toISOString(),
      };

      normalizedArticles.push(normalized);
    }

    logger.info(`[newsService] Normalized to ${normalizedArticles.length} unique articles.`);
    return normalizedArticles;
  } catch (error) {
    logger.error(`[newsService] Failed to fetch news: ${error.message}`);
    throw error;
  }
}

module.exports = {
  fetchNews,
};
