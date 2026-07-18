const express = require('express');
const router = express.Router();

const { verifyJWT } = require('../middleware/authMiddleware');
const {
  getContacts,
  getContactById,
  createContact,
  updateContact,
  deleteContact,
} = require('../controllers/emergencyContactController');
const {
  validateCreateContact,
  validateUpdateContact,
} = require('../validators/emergencyContactValidator');

// Apply verifyJWT to protect all endpoints in this file
router.use(verifyJWT);

// POST /api/contacts - Create a new emergency contact
router.post('/', validateCreateContact, createContact);

// GET /api/contacts - Retrieve all emergency contacts
router.get('/', getContacts);

// GET /api/contacts/:id - Retrieve a single emergency contact
router.get('/:id', getContactById);

// PUT /api/contacts/:id - Update an emergency contact
router.put('/:id', validateUpdateContact, updateContact);

// DELETE /api/contacts/:id - Delete an emergency contact
router.delete('/:id', deleteContact);

module.exports = router;
