const ApiError = require('../utils/apiError');

/**
 * Global Express error-handling middleware.
 * Must be registered last — after all routes and other middleware.
 */
// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
  // Normalise to an ApiError; unknown errors become a 500
  let error = err;

  if (!(error instanceof ApiError)) {
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';
    error = new ApiError(statusCode, message, error?.errors || [], err.stack);
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    const value = err.keyValue ? err.keyValue[field] : '';
    error = new ApiError(
      409,
      `${field.charAt(0).toUpperCase() + field.slice(1)} "${value}" is already in use`,
      []
    );
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    error = new ApiError(400, 'Validation failed', errors);
  }

  const response = {
    success: false,
    message: error.message,
    errors: error.errors,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  };

  return res.status(error.statusCode || 500).json(response);
};

module.exports = { errorMiddleware };
