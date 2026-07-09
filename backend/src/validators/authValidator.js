const ApiError = require('../utils/apiError');

/**
 * Validate Signup Request
 */
const validateSignup = (req, res, next) => {
  const { username, email, password } = req.body;
  const errors = [];

  // Username validation
  if (!username || typeof username !== 'string') {
    errors.push({ field: 'username', message: 'Username is required and must be a string' });
  } else {
    const trimmedUsername = username.trim();
    if (trimmedUsername.length < 3) {
      errors.push({ field: 'username', message: 'Username must be at least 3 characters long' });
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      errors.push({ field: 'username', message: 'Username can only contain alphanumeric characters and underscores' });
    }
  }

  // Email validation
  if (!email || typeof email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required and must be a string' });
  } else {
    const trimmedEmail = email.trim();
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(trimmedEmail)) {
      errors.push({ field: 'email', message: 'Please provide a valid email address' });
    }
  }

  // Password validation
  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required and must be a string' });
  } else {
    if (password.length < 6) {
      errors.push({ field: 'password', message: 'Password must be at least 6 characters long' });
    }
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  // Replace body fields with sanitized strings
  req.body.username = username.trim().toLowerCase();
  req.body.email = email.trim().toLowerCase();

  next();
};

/**
 * Validate Login Request
 */
const validateLogin = (req, res, next) => {
  const { email, password } = req.body;
  const errors = [];

  if (!email || typeof email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required and must be a string' });
  }

  if (!password || typeof password !== 'string') {
    errors.push({ field: 'password', message: 'Password is required and must be a string' });
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  // Sanitize email
  req.body.email = email.trim().toLowerCase();

  next();
};

module.exports = {
  validateSignup,
  validateLogin,
};
