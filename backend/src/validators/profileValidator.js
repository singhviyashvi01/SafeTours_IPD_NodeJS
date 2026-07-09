const ApiError = require('../utils/apiError');

// Helper to validate phone number format
const isValidPhone = (phone) => {
  const phoneRegex = /^\+?[\d\s\-()]{7,20}$/;
  return phoneRegex.test(phone);
};

// Helper to check if value is boolean
const isBoolean = (val) => {
  return typeof val === 'boolean';
};

/**
 * Validate Update Profile Request
 */
const validateUpdateProfile = (req, res, next) => {
  const { name, phone, address, nationality, languages, gender, dateOfBirth, profileImage } = req.body;
  const errors = [];

  // Name is required, 2-60 characters
  if (name === undefined || typeof name !== 'string') {
    errors.push({ field: 'name', message: 'Name is required and must be a string' });
  } else {
    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 60) {
      errors.push({ field: 'name', message: 'Name must be between 2 and 60 characters long' });
    }
  }

  // Phone validation (optional, valid phone format)
  if (phone !== undefined && phone !== null && phone !== '') {
    if (typeof phone !== 'string' || !isValidPhone(phone)) {
      errors.push({ field: 'phone', message: 'Phone must be a valid phone number' });
    }
  }

  // Gender validation (allowed values check)
  if (gender !== undefined && gender !== null && gender !== '') {
    const allowedGenders = ['Male', 'Female', 'Other', 'Prefer not to say'];
    if (!allowedGenders.includes(gender)) {
      errors.push({ field: 'gender', message: 'Gender must be one of: Male, Female, Other, Prefer not to say' });
    }
  }

  // Languages validation (array of strings)
  if (languages !== undefined && languages !== null) {
    if (!Array.isArray(languages)) {
      errors.push({ field: 'languages', message: 'Languages must be an array of strings' });
    } else {
      const allStrings = languages.every((lang) => typeof lang === 'string');
      if (!allStrings) {
        errors.push({ field: 'languages', message: 'All languages must be strings' });
      }
    }
  }

  // Date of birth validation (valid date representation)
  if (dateOfBirth !== undefined && dateOfBirth !== null && dateOfBirth !== '') {
    const parsedDate = Date.parse(dateOfBirth);
    if (isNaN(parsedDate)) {
      errors.push({ field: 'dateOfBirth', message: 'Date of birth must be a valid date' });
    }
  }

  // Profile Image validation
  if (profileImage !== undefined && profileImage !== null && profileImage !== '') {
    if (typeof profileImage !== 'string') {
      errors.push({ field: 'profileImage', message: 'Profile image must be a string URL' });
    }
  }

  // Address validation
  if (address !== undefined && address !== null) {
    if (typeof address !== 'object' || Array.isArray(address)) {
      errors.push({ field: 'address', message: 'Address must be an object' });
    } else {
      const addressFields = ['country', 'state', 'city', 'street', 'postalCode'];
      addressFields.forEach((field) => {
        if (address[field] !== undefined && address[field] !== null && typeof address[field] !== 'string') {
          errors.push({ field: `address.${field}`, message: `${field} must be a string` });
        }
      });
    }
  }

  // Security: prevent user profile updates from overwriting security or auth fields
  delete req.body.password;
  delete req.body.email;
  delete req.body.role;

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  next();
};

/**
 * Validate Medical Info Request
 */
const validateMedicalInfo = (req, res, next) => {
  const { bloodGroup, medicalInfo } = req.body;
  const errors = [];

  // Validate bloodGroup
  if (bloodGroup !== undefined && bloodGroup !== null && bloodGroup !== '') {
    const allowedBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
    if (!allowedBloodGroups.includes(bloodGroup)) {
      errors.push({ field: 'bloodGroup', message: 'Blood Group must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-' });
    }
  }

  // Validate medicalInfo object
  if (medicalInfo !== undefined && medicalInfo !== null) {
    if (typeof medicalInfo !== 'object' || Array.isArray(medicalInfo)) {
      errors.push({ field: 'medicalInfo', message: 'Medical info must be an object' });
    } else {
      const stringFields = [
        'allergies',
        'medicalConditions',
        'currentMedications',
        'doctorName',
        'doctorPhone',
        'additionalNotes',
      ];
      stringFields.forEach((field) => {
        if (medicalInfo[field] !== undefined && medicalInfo[field] !== null && typeof medicalInfo[field] !== 'string') {
          errors.push({ field: `medicalInfo.${field}`, message: `${field} must be a string` });
        }
      });

      // Doctor phone validation if provided
      if (medicalInfo.doctorPhone && typeof medicalInfo.doctorPhone === 'string' && medicalInfo.doctorPhone.trim() !== '') {
        if (!isValidPhone(medicalInfo.doctorPhone)) {
          errors.push({ field: 'medicalInfo.doctorPhone', message: 'Doctor phone must be a valid phone number' });
        }
      }

      // Boolean fields validation
      const booleanFields = ['organDonor', 'wheelchairRequired'];
      booleanFields.forEach((field) => {
        if (medicalInfo[field] !== undefined && medicalInfo[field] !== null && !isBoolean(medicalInfo[field])) {
          errors.push({ field: `medicalInfo.${field}`, message: `${field} must be a boolean` });
        }
      });
    }
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  next();
};

/**
 * Validate Emergency Settings Request
 */
const validateEmergencySettings = (req, res, next) => {
  const { emergencySettings } = req.body;
  const errors = [];

  if (emergencySettings === undefined || emergencySettings === null) {
    errors.push({ field: 'emergencySettings', message: 'Emergency settings are required' });
  } else if (typeof emergencySettings !== 'object' || Array.isArray(emergencySettings)) {
    errors.push({ field: 'emergencySettings', message: 'Emergency settings must be an object' });
  } else {
    // Boolean checks
    const booleanFields = [
      'shareLiveLocation',
      'autoSOS',
      'silentSOS',
      'receiveWeatherAlerts',
      'receiveDangerZoneAlerts',
    ];
    booleanFields.forEach((field) => {
      if (emergencySettings[field] !== undefined && emergencySettings[field] !== null && !isBoolean(emergencySettings[field])) {
        errors.push({ field: `emergencySettings.${field}`, message: `${field} must be a boolean` });
      }
    });

    // locationUpdateInterval check
    const interval = emergencySettings.locationUpdateInterval;
    if (interval !== undefined && interval !== null) {
      if (!Number.isInteger(interval) || interval < 30 || interval > 600) {
        errors.push({
          field: 'emergencySettings.locationUpdateInterval',
          message: 'locationUpdateInterval must be an integer between 30 and 600',
        });
      }
    }

    // preferredLanguage check
    if (emergencySettings.preferredLanguage !== undefined && emergencySettings.preferredLanguage !== null) {
      if (typeof emergencySettings.preferredLanguage !== 'string') {
        errors.push({ field: 'emergencySettings.preferredLanguage', message: 'preferredLanguage must be a string' });
      }
    }
  }

  if (errors.length > 0) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  next();
};

module.exports = {
  validateUpdateProfile,
  validateMedicalInfo,
  validateEmergencySettings,
};
