const express = require('express');
const { verifyJWT } = require('../middleware/authMiddleware');
const { sosGeneral, sosCreate } = require('../middleware/rateLimiters');
const { validateCreateSOS, validateSosId, validateCancelSOS, validateSOSRequest } = require('../validators/sosValidator');
const { createSOS, getPending, getActive, confirmSOS, cancelSOS, getSOSHistory } = require('../controllers/sosController');

const router = express.Router();

router.use(verifyJWT, sosGeneral);

router.post('/', sosCreate, validateCreateSOS, validateSOSRequest, createSOS);
router.get('/pending', getPending);
router.get('/active', getActive);
router.get('/history', getSOSHistory);
router.post('/:id/confirm', sosCreate, validateSosId, validateSOSRequest, confirmSOS);
router.post('/:id/cancel', validateCancelSOS, validateSOSRequest, cancelSOS);

module.exports = router;
