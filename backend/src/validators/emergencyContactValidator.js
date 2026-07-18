const ApiError = require('../utils/apiError');

// Helper to validate phone format
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
  return phoneRegex.test(phone);
};

// Helper to validate email format
const isValidEmail = (email) => {
  const emailRegex = /^\S+@\S+\.\S+$/;
  return emailRegex.test(email);
};

// Helper to validate boolean
const isBoolean = (val) => {
  return typeof val === 'boolean';
};

/**
 * Validate Creation of Emergency Contact
 */
const validateCreateContact = (req, res, next) => {
  const { name, relationship, phone, email, priority, isPrimary } = req.body;
  const errors = [];

  // name validation (Required)
  if (name === undefined || name === null || typeof name !== 'string' || name.trim() === '') {
    errors.push({ field: 'name', message: 'Name is required and must be a non-empty string' });
  }

  // relationship validation (Required)
  if (relationship === undefined || relationship === null || typeof relationship !== 'string' || relationship.trim() === '') {
    errors.push({ field: 'relationship', message: 'Relationship is required and must be a non-empty string' });
  }

  // phone validation (Required, valid format)
  if (phone === undefined || phone === null || typeof phone !== 'string' || phone.trim() === '') {
    errors.push({ field: 'phone', message: 'Phone number is required and must be a non-empty string' });
  } else if (!isValidPhone(phone)) {
    errors.push({ field: 'phone', message: 'Phone must be a valid phone number format' });
  }

  // email validation (Optional)
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !isValidEmail(email)) {
      errors.push({ field: 'email', message: 'Please provide a valid email address' });
    }
  }

  // priority validation (Optional, must be integer)
  if (priority !== undefined && priority !== null) {
    if (!Number.isInteger(priority)) {
      errors.push({ field: 'priority', message: 'Priority must be an integer' });
    }
  }

  // isPrimary validation (Optional, must be boolean)
  if (isPrimary !== undefined && isPrimary !== null) {
    if (!isBoolean(isPrimary)) {
      errors.push({ field: 'isPrimary', message: 'isPrimary must be a boolean' });
    }
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  // Sanitize strings
  req.body.name = name.trim();
  req.body.relationship = relationship.trim();
  req.body.phone = phone.trim();
  if (email) req.body.email = email.trim().toLowerCase();

  next();
};

/**
 * Validate Update of Emergency Contact
 */
const validateUpdateContact = (req, res, next) => {
  const { name, relationship, phone, email, priority, isPrimary } = req.body;
  const errors = [];

  // name validation (Optional)
  if (name !== undefined) {
    if (name === null || typeof name !== 'string' || name.trim() === '') {
      errors.push({ field: 'name', message: 'Name must be a non-empty string' });
    } else {
      req.body.name = name.trim();
    }
  }

  // relationship validation (Optional)
  if (relationship !== undefined) {
    if (relationship === null || typeof relationship !== 'string' || relationship.trim() === '') {
      errors.push({ field: 'relationship', message: 'Relationship must be a non-empty string' });
    } else {
      req.body.relationship = relationship.trim();
    }
  }

  // phone validation (Optional, valid format)
  if (phone !== undefined) {
    if (phone === null || typeof phone !== 'string' || phone.trim() === '') {
      errors.push({ field: 'phone', message: 'Phone must be a non-empty string' });
    } else if (!isValidPhone(phone)) {
      errors.push({ field: 'phone', message: 'Phone must be a valid phone number format' });
    } else {
      req.body.phone = phone.trim();
    }
  }

  // email validation (Optional, valid format)
  if (email !== undefined && email !== null && email !== '') {
    if (typeof email !== 'string' || !isValidEmail(email)) {
      errors.push({ field: 'email', message: 'Please provide a valid email address' });
    } else {
      req.body.email = email.trim().toLowerCase();
    }
  }

  // priority validation (Optional, must be integer)
  if (priority !== undefined && priority !== null) {
    if (!Number.isInteger(priority)) {
      errors.push({ field: 'priority', message: 'Priority must be an integer' });
    }
  }

  // isPrimary validation (Optional, must be boolean)
  if (isPrimary !== undefined && isPrimary !== null) {
    if (!isBoolean(isPrimary)) {
      errors.push({ field: 'isPrimary', message: 'isPrimary must be a boolean' });
    }
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  next();
};

module.exports = {
  validateCreateContact,
  validateUpdateContact,
};
