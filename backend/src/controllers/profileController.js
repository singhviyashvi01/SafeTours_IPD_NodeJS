const profileService = require('../services/profileService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * GET /profile
 * Returns the authenticated user's profile.
 */
const getProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.getProfile(req.user._id);
  return res.status(200).json(
    new ApiResponse(200, { profile }, 'Profile retrieved successfully')
  );
});

/**
 * PUT /profile
 * Updates name, phone, address, nationality, languages, gender, dateOfBirth, profileImage.
 */
const updateProfile = asyncHandler(async (req, res) => {
  const profile = await profileService.updateProfile(req.user._id, req.body);
  logger.info(`Profile Updated for user: ${req.user._id}`);
  return res.status(200).json(
    new ApiResponse(200, { profile }, 'Profile updated successfully')
  );
});

/**
 * PUT /profile/medical
 * Updates only medical info and bloodGroup.
 */
const updateMedicalInfo = asyncHandler(async (req, res) => {
  const profile = await profileService.updateMedicalInfo(req.user._id, req.body);
  logger.info(`Medical Info Updated for user: ${req.user._id}`);
  return res.status(200).json(
    new ApiResponse(200, { profile }, 'Medical information updated successfully')
  );
});

/**
 * PUT /profile/settings
 * Updates only Emergency Settings.
 */
const updateEmergencySettings = asyncHandler(async (req, res) => {
  const profile = await profileService.updateEmergencySettings(req.user._id, req.body);
  logger.info(`Emergency Settings Updated for user: ${req.user._id}`);
  return res.status(200).json(
    new ApiResponse(200, { profile }, 'Emergency settings updated successfully')
  );
});

/**
 * GET /profile/completeness
 * Returns completion percentage and list of missing fields.
 */
const getProfileCompleteness = asyncHandler(async (req, res) => {
  const completeness = await profileService.getProfileCompleteness(req.user._id);
  return res.status(200).json(
    new ApiResponse(200, completeness, 'Profile completeness calculated successfully')
  );
});

/**
 * DELETE /profile/image
 * Sets profileImage = null.
 */
const deleteProfileImage = asyncHandler(async (req, res) => {
  const profile = await profileService.deleteProfileImage(req.user._id);
  return res.status(200).json(
    new ApiResponse(200, { profile }, 'Profile image deleted successfully')
  );
});

module.exports = {
  getProfile,
  updateProfile,
  updateMedicalInfo,
  updateEmergencySettings,
  getProfileCompleteness,
  deleteProfileImage,
};
