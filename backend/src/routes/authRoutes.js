const express = require('express');
const router = express.Router();

const { signup, login, refreshToken, getMe } = require('../controllers/authController');
const { verifyJWT } = require('../middleware/authMiddleware');
const { validateSignup, validateLogin } = require('../validators/authValidator');

// POST /api/auth/signup
router.post('/signup', validateSignup, signup);

// POST /api/auth/login
router.post('/login', validateLogin, login);

// POST /api/auth/refresh-token
router.post('/refresh-token', refreshToken);

// GET /api/auth/me  (protected)
router.get('/me', verifyJWT, getMe);

module.exports = router;
