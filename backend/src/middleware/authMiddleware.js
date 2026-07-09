const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Protects routes by verifying the JWT access token.
 * Accepts token from:
 *   1. Authorization header: "Bearer <token>"
 *   2. httpOnly cookie: "accessToken"
 */
const verifyJWT = asyncHandler(async (req, res, next) => {
  const token =
    req.cookies?.accessToken ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  if (!token) {
    throw new ApiError(401, 'Unauthorized – access token is required');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw new ApiError(401, 'Access token has expired');
    }
    throw new ApiError(401, 'Invalid access token');
  }

  const user = await User.findById(decoded._id).select('-password');

  if (!user) {
    throw new ApiError(401, 'User belonging to this token no longer exists');
  }

  req.user = user;
  next();
});

module.exports = { verifyJWT };
