const express = require('express');
const router = express.Router();
const { getWeather } = require('../controllers/weather.controller');

/**
 * Purpose of this file:
 * Register the weather endpoint under the existing API routing structure.
 * This keeps the route definition isolated and does not change existing route behavior.
 */

/**
 * Purpose of this route:
 * Expose GET /api/weather so the client can request weather data by coordinates.
 * Why it is needed:
 * The weather feature is a new endpoint and should be mounted independently from existing routes.
 * Input:
 * Query parameters lat and lon supplied by the client.
 * Output:
 * A JSON response produced by the weather controller.
 */
router.get('/', getWeather);

module.exports = router;
