const EmergencyContact = require('../models/EmergencyContact');
const ApiError = require('../utils/apiError');

/**
 * Fetch all emergency contacts for a user
 */
const getContacts = async (userId) => {
  return EmergencyContact.find({ user: userId }).sort({ priority: 1, createdAt: -1 });
};

/**
 * Fetch a single emergency contact by ID, ensuring it belongs to the user
 */
const getContactById = async (userId, contactId) => {
  const contact = await EmergencyContact.findOne({ _id: contactId, user: userId });
  if (!contact) {
    throw new ApiError(404, 'Emergency contact not found');
  }
  return contact;
};

/**
 * Create a new emergency contact, enforcing constraints
 */
const createContact = async (userId, contactData) => {
  // 1. Limit to max 5 emergency contacts
  const count = await EmergencyContact.countDocuments({ user: userId });
  if (count >= 5) {
    throw new ApiError(400, 'Maximum of 5 emergency contacts allowed');
  }

  // 2. Prevent duplicate phone numbers for the same user
  const duplicate = await EmergencyContact.findOne({ user: userId, phone: contactData.phone });
  if (duplicate) {
    throw new ApiError(409, 'An emergency contact with this phone number already exists');
  }

  // 3. Resolve single primary contact constraint
  if (contactData.isPrimary === true) {
    await EmergencyContact.updateMany({ user: userId, isPrimary: true }, { $set: { isPrimary: false } });
  }

  // Create the contact
  const contact = await EmergencyContact.create({
    ...contactData,
    user: userId,
  });

  return contact;
};

/**
 * Update an existing emergency contact
 */
const updateContact = async (userId, contactId, contactData) => {
  const contact = await EmergencyContact.findOne({ _id: contactId, user: userId });
  if (!contact) {
    throw new ApiError(404, 'Emergency contact not found');
  }

  // 1. If phone number is updated, prevent duplicate phone numbers for the same user
  if (contactData.phone && contactData.phone !== contact.phone) {
    const duplicate = await EmergencyContact.findOne({ user: userId, phone: contactData.phone });
    if (duplicate) {
      throw new ApiError(409, 'An emergency contact with this phone number already exists');
    }
  }

  // 2. Resolve single primary contact constraint
  if (contactData.isPrimary === true) {
    await EmergencyContact.updateMany(
      { user: userId, _id: { $ne: contactId }, isPrimary: true },
      { $set: { isPrimary: false } }
    );
  }

  // Apply updates
  const fields = ['name', 'relationship', 'phone', 'email', 'priority', 'isPrimary', 'notes'];
  fields.forEach((field) => {
    if (contactData[field] !== undefined) {
      contact[field] = contactData[field];
    }
  });

  await contact.save();
  return contact;
};

/**
 * Delete an emergency contact
 */
const deleteContact = async (userId, contactId) => {
  const contact = await EmergencyContact.findOne({ _id: contactId, user: userId });
  if (!contact) {
    throw new ApiError(404, 'Emergency contact not found');
  }

  await EmergencyContact.deleteOne({ _id: contactId });
  return contact;
};

module.exports = {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
};
