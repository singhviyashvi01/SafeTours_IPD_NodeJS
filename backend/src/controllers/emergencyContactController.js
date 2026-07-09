const emergencyContactService = require('../services/emergencyContactService');
const ApiResponse = require('../utils/apiResponse');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Fetch all emergency contacts of the user
 */
const getContacts = asyncHandler(async (req, res) => {
  const contacts = await emergencyContactService.getContacts(req.user._id);
  return res.status(200).json(
    new ApiResponse(200, contacts, 'Emergency contacts retrieved successfully')
  );
});

/**
 * Fetch a single emergency contact by ID
 */
const getContactById = asyncHandler(async (req, res) => {
  const contact = await emergencyContactService.getContactById(req.user._id, req.params.id);
  return res.status(200).json(
    new ApiResponse(200, contact, 'Emergency contact retrieved successfully')
  );
});

/**
 * Create a new emergency contact
 */
const createContact = asyncHandler(async (req, res) => {
  const contact = await emergencyContactService.createContact(req.user._id, req.body);
  logger.info(`Emergency Contact Created for user: ${req.user._id}`);
  return res.status(201).json(
    new ApiResponse(201, contact, 'Emergency contact created successfully')
  );
});

/**
 * Update an existing emergency contact
 */
const updateContact = asyncHandler(async (req, res) => {
  const contact = await emergencyContactService.updateContact(req.user._id, req.params.id, req.body);
  logger.info(`Emergency Contact Updated for user: ${req.user._id}`);
  return res.status(200).json(
    new ApiResponse(200, contact, 'Emergency contact updated successfully')
  );
});

/**
 * Delete an emergency contact
 */
const deleteContact = asyncHandler(async (req, res) => {
  const contact = await emergencyContactService.deleteContact(req.user._id, req.params.id);
  logger.info(`Emergency Contact Deleted for user: ${req.user._id}`);
  return res.status(200).json(
    new ApiResponse(200, contact, 'Emergency contact deleted successfully')
  );
});

module.exports = {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
};
