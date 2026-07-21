const axios = require('axios');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');

/**
 * Fetches recent news articles from the configured News API.
 * Uses NEWS_API_URL and NEWSDATA_API_KEY. Supports NewsData.io API format.
 *
 * @param {string} [query='Mumbai'] - The search keyword query.
 * @returns {Promise<Object[]>} A list of normalized and deduplicated news articles.
 */
async function fetchNews(query = 'Mumbai') {
  const apiKey = process.env.NEWSDATA_API_KEY;
  const apiUrl = process.env.NEWS_API_URL || 'https://newsdata.io/api/1/news';

  if (!apiKey) {
    logger.error('[newsService] NEWSDATA_API_KEY is not defined in environment variables.');
    throw new ApiError(500, 'NEWSDATA_API_KEY is not defined in environment variables.');
  }

  // Construct request parameters dynamically
  const rawParams = {
    apikey: apiKey,
    q: query && typeof query === 'string' ? query.trim() : 'Mumbai',
    country: 'in',
    language: 'en',
    size: 10, // NewsData.io free plan allows up to 10 articles (size > 10 causes HTTP 422 UnsupportedFilter)
  };

  const params = {};
  for (const [key, value] of Object.entries(rawParams)) {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value;
    }
  }

  // Create masked params for safe logging (hides secret API key)
  const maskedParams = {
    ...params,
    apikey: apiKey ? `${apiKey.substring(0, 5)}***${apiKey.substring(apiKey.length - 4)}` : undefined,
  };

  logger.info(`[newsService] Requesting news from ${apiUrl}`);
  logger.info(`[newsService] Request parameters: ${JSON.stringify(maskedParams)}`);

  try {
    const response = await axios.get(apiUrl, {
      params,
      timeout: 10000, // 10s timeout
    });

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
    logger.error(`[newsService] Failed request to ${apiUrl}`);
    logger.error(`[newsService] Request parameters (masked): ${JSON.stringify(maskedParams)}`);

    if (error.response) {
      logger.error(`[newsService] NewsData.io API Error Status: ${error.response.status}`);
      logger.error(`[newsService] NewsData.io API Response Body: ${JSON.stringify(error.response.data)}`);
    } else {
      logger.error(`[newsService] NewsData.io Network/Error Message: ${error.message}`);
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new ApiError(504, 'NewsData.io request timed out.');
    }

    const status = error.response?.status;
    const apiMessage = error.response?.data?.results?.message || error.response?.data?.message || error.message;

    switch (status) {
      case 400:
        throw new ApiError(400, `NewsData.io Bad Request: ${apiMessage}`);
      case 401:
        throw new ApiError(401, 'NewsData.io Unauthorized: Invalid or missing API key.');
      case 403:
        throw new ApiError(403, 'NewsData.io Forbidden: Access limit reached or access denied.');
      case 404:
        throw new ApiError(404, 'NewsData.io Not Found: Requested resource or endpoint not found.');
      case 422:
        throw new ApiError(422, `NewsData.io Unprocessable Entity: ${apiMessage}`);
      case 429:
        throw new ApiError(429, 'NewsData.io Rate Limit Exceeded: Too many requests.');
      default:
        if (status >= 500) {
          throw new ApiError(502, 'NewsData.io service is temporarily unavailable.');
        }
        throw new ApiError(status || 500, `News API error: ${apiMessage}`);
    }
  }
}

module.exports = {
  fetchNews,
};
