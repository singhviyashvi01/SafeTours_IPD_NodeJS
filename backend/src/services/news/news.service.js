const axios = require('axios');
const ApiError = require('../../utils/apiError');

/**
 * Purpose of this service:
 * Fetch recent news articles from the NewsData.io API for a given location.
 *
 * Why this exists:
 * The environmental module needs a lightweight stream of local news articles that can
 * be scored for risk. This service isolates the external API call and returns only a
 * compact field set that the frontend can display as incident cards.
 */
const NEWS_API_BASE_URL = 'https://newsdata.io/api/1/news';

const normalizeArticles = (rawArticles = []) => {
  return rawArticles
    .filter(Boolean)
    .map((article) => ({
      title: article.title || 'Untitled article',
      description: article.description || article.content || '',
      link: article.link || '',
      pubDate: article.pubDate || article.pub_date || null,
      sourceId: article.source_id || article.source?.id || null,
      country: article.country || null,
      keywords: Array.isArray(article.keywords) ? article.keywords : [],
    }))
    .slice(0, 8);
};

const getLatestNews = async (location = 'Mumbai') => {
  const apiKey = process.env.NEWSDATA_API_KEY;
  if (!apiKey) {
    const error = new ApiError(500, 'NewsData.io API key is not configured.');
    throw error;
  }

  const queryLocation = String(location || 'Mumbai').trim();
  if (!queryLocation) {
    const error = new ApiError(400, 'Location is required for news lookup.');
    throw error;
  }

  try {
    const response = await axios.get(NEWS_API_BASE_URL, {
      params: {
        apikey: apiKey,
        q: queryLocation,
        country: 'in',
        language: 'en',
        size: 8,
      },
      timeout: 10000,
    });

    const results = Array.isArray(response?.data?.results) ? response.data.results : [];
    return normalizeArticles(results);
  } catch (error) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      const timeoutError = new ApiError(504, 'News API request timed out.');
      throw timeoutError;
    }

    if (error.response?.status === 401) {
      const invalidApiError = new ApiError(401, 'NewsData.io API key is invalid or unauthorized.');
      throw invalidApiError;
    }

    if (error.response?.status >= 500) {
      const serverError = new ApiError(502, 'News service is temporarily unavailable.');
      throw serverError;
    }

    if (error.response?.status === 400) {
      const badRequest = new ApiError(400, 'News request could not be processed.');
      throw badRequest;
    }

    const fallbackError = new ApiError(error.response?.status || 500, error.message || 'Unable to fetch news data.');
    throw fallbackError;
  }
};

module.exports = {
  getLatestNews,
};
