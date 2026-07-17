const weatherService = require('../services/weather/weather.service');

/**
 * Purpose of this file:
 * Handle the HTTP layer for the weather endpoint by validating incoming query values
 * and returning JSON responses without embedding business logic in the route.
 */

/**
 * Purpose of this function:
 * Read latitude and longitude from the request query, validate them, call the weather service,
 * and return a JSON response to the client.
 * Why it is needed:
 * The route should stay lightweight while the controller manages validation and response formatting.
 * Input:
 * req.query.lat and req.query.lon from Express.
 * Output:
 * A JSON response with weather data or an error message and status code.
 */
const getWeather = async (req, res) => {
  // Purpose of this validation:
  // Reject requests that are missing the required coordinates before calling the service.
  const { lat, lon } = req.query;
  if (lat === undefined || lat === '' || lon === undefined || lon === '') {
    return res.status(400).json({
      success: false,
      message: 'Latitude and longitude are required.',
    });
  }

  try {
    const weatherData = await weatherService.getCurrentWeather(lat, lon);

    // Purpose of this response formatting:
    // Return a consistent success payload for the frontend while keeping the service output compact.
    return res.status(200).json({
      success: true,
      message: 'Weather data retrieved successfully.',
      data: weatherData,
    });
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getWeather,
};
