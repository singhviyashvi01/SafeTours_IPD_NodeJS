const express = require('express');
const { verifyJWT } = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');
const { debugRisk } = require('../controllers/risk.controller');
const { locationRules, validateRequest } = require('../validators/riskValidator');

const router = express.Router();

// Everything under /api/admin requires a signed-in user with role "admin".
router.use(verifyJWT, requireRole('admin'));

router.get('/risk/debug', locationRules, validateRequest, debugRisk);

module.exports = router;
