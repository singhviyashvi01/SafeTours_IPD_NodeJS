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
    throw new ApiError(500, 'NEWSDATA_API_KEY is missing in the .env file.');
  }

  const queryLocation = String(location || 'Mumbai').trim();

  if (!queryLocation) {
    throw new ApiError(400, 'Location is required for news lookup.');
  }

  try {
    console.log('==============================');
    console.log('Fetching NewsData.io Articles');
    console.log('Location:', queryLocation);
    console.log('API Key Present:', !!apiKey);
    console.log('==============================');

    const response = await axios.get(NEWS_API_BASE_URL, {
      params: {
        apikey: apiKey,
        q: queryLocation,
        country: 'in',
        language: 'en',
      },
      timeout: 10000,
    });

    const results = Array.isArray(response?.data?.results)
      ? response.data.results
      : [];

    console.log(`Fetched ${results.length} articles from NewsData.io`);

    return normalizeArticles(results);
  } catch (error) {
    console.log('\n========== NEWSDATA API ERROR ==========');
    console.log('Status:', error.response?.status);
    console.log('Message:', error.message);

    if (error.response?.data) {
      console.log(
        'Response:',
        JSON.stringify(error.response.data, null, 2)
      );
    }

    console.log('========================================\n');

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new ApiError(504, 'NewsData.io request timed out.');
    }

    if (error.response?.status === 401) {
      throw new ApiError(
        401,
        'Invalid or unauthorized NewsData.io API key.'
      );
    }

    if (error.response?.status === 422) {
      throw new ApiError(
        422,
        'NewsData.io rejected the request. Check the API response printed above for the exact reason.'
      );
    }

    if (error.response?.status === 400) {
      throw new ApiError(
        400,
        'Invalid request sent to NewsData.io.'
      );
    }

    if (error.response?.status >= 500) {
      throw new ApiError(
        502,
        'NewsData.io service is temporarily unavailable.'
      );
    }

    throw new ApiError(
      error.response?.status || 500,
      error.response?.data?.results?.message ||
        error.response?.data?.message ||
        error.message ||
        'Unable to fetch news from NewsData.io.'
    );
  }
};

module.exports = {
  getLatestNews,
};