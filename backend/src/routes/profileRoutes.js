const express = require('express');
const router = express.Router();

const { verifyJWT } = require('../middleware/authMiddleware');
const {
  getProfile,
  updateProfile,
  updateMedicalInfo,
  updateEmergencySettings,
  getProfileCompleteness,
  deleteProfileImage,
} = require('../controllers/profileController');
const {
  validateUpdateProfile,
  validateMedicalInfo,
  validateEmergencySettings,
} = require('../validators/profileValidator');

// Apply verifyJWT to protect all endpoints in this file
router.use(verifyJWT);

// GET /api/profile - Fetch authenticated user profile
router.get('/', getProfile);

// PUT /api/profile - Update main profile information
router.put('/', validateUpdateProfile, updateProfile);

// PUT /api/profile/medical - Update medical information
router.put('/medical', validateMedicalInfo, updateMedicalInfo);

// PUT /api/profile/settings - Update emergency settings
router.put('/settings', validateEmergencySettings, updateEmergencySettings);

// GET /api/profile/completeness - Fetch profile completeness score
router.get('/completeness', getProfileCompleteness);

// DELETE /api/profile/image - Clear profile image
router.delete('/image', deleteProfileImage);

module.exports = router;
