const express = require('express');
const { verifyJWT } = require('../middleware/authMiddleware');
const { assistantMinute, assistantHour } = require('../middleware/rateLimiters');
const { chat } = require('../controllers/assistant.controller');
const { chatRules, validateRequest } = require('../validators/assistantValidator');

const router = express.Router();

router.use(verifyJWT);

// POST /api/assistant/chat
router.post('/chat', assistantMinute, assistantHour, chatRules, validateRequest, chat);

module.exports = router;
