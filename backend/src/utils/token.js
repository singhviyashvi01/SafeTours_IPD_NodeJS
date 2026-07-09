const jwt = require('jsonwebtoken');

/**
 * Generate JWT Access Token
 * @param {Object} user User document
 * @returns {String} Signed Access Token
 */
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
      email: user.email,
      username: user.username,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m',
    }
  );
};

/**
 * Generate JWT Refresh Token
 * @param {Object} user User document
 * @returns {String} Signed Refresh Token
 */
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      _id: user._id,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    }
  );
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
};
