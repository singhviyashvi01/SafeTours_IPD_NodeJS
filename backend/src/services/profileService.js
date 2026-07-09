const User = require('../models/User');
const ApiError = require('../utils/apiError');

/**
 * Sanitize User object before returning to clients.
 * Prevents password, versioning (__v) and sensitive tokens from being leaked.
 */
const sanitizeUser = (user) => {
  if (!user) return null;
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  delete obj.__v;
  return obj;
};

/**
 * Calculate the profile completeness percentage and missing fields list.
 */
const calculateCompleteness = (user) => {
  const fieldsToCheck = [
    { path: 'name', label: 'name' },
    { path: 'phone', label: 'phone' },
    { path: 'profileImage', label: 'profileImage' },
    { path: 'dateOfBirth', label: 'dateOfBirth' },
    { path: 'gender', label: 'gender' },
    { path: 'nationality', label: 'nationality' },
    { path: 'languages', label: 'languages', isArray: true },
    { path: 'bloodGroup', label: 'bloodGroup' },
    { path: 'address.country', label: 'country' },
    { path: 'address.state', label: 'state' },
    { path: 'address.city', label: 'city' },
    { path: 'address.street', label: 'street' },
    { path: 'address.postalCode', label: 'postalCode' },
    { path: 'medicalInfo.allergies', label: 'allergies' },
    { path: 'medicalInfo.medicalConditions', label: 'medicalConditions' },
    { path: 'medicalInfo.currentMedications', label: 'currentMedications' },
    { path: 'medicalInfo.doctorName', label: 'doctorName' },
    { path: 'medicalInfo.doctorPhone', label: 'doctorPhone' },
    { path: 'medicalInfo.organDonor', label: 'organDonor', isBoolean: true },
    { path: 'medicalInfo.wheelchairRequired', label: 'wheelchairRequired', isBoolean: true },
    { path: 'medicalInfo.additionalNotes', label: 'additionalNotes' },
  ];

  let filledCount = 0;
  const missingFields = [];

  const getNestedValue = (obj, path) => {
    return path.split('.').reduce((acc, part) => acc && acc[part], obj);
  };

  fieldsToCheck.forEach(({ path, label, isArray, isBoolean }) => {
    const val = getNestedValue(user, path);
    let isFilled = false;

    if (isBoolean) {
      isFilled = val !== undefined && val !== null;
    } else if (isArray) {
      isFilled = Array.isArray(val) && val.length > 0;
    } else {
      isFilled = val !== undefined && val !== null && String(val).trim() !== '';
    }

    if (isFilled) {
      filledCount++;
    } else {
      missingFields.push(label);
    }
  });

  const completion = Math.round((filledCount / fieldsToCheck.length) * 100);
  return { completion, missingFields };
};

/**
 * Fetch Profile Service
 */
const getProfile = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return sanitizeUser(user);
};

/**
 * Update Profile Service
 */
const updateProfile = async (userId, updateData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Update profile fields
  const allowedFields = ['name', 'phone', 'nationality', 'languages', 'gender', 'dateOfBirth', 'profileImage'];
  allowedFields.forEach((field) => {
    if (updateData[field] !== undefined) {
      user[field] = updateData[field];
    }
  });

  // Update address subdocument
  if (updateData.address && typeof updateData.address === 'object') {
    const addressFields = ['country', 'state', 'city', 'street', 'postalCode'];
    addressFields.forEach((field) => {
      if (updateData.address[field] !== undefined) {
        user.address[field] = updateData.address[field];
      }
    });
  }

  await user.save();
  return sanitizeUser(user);
};

/**
 * Update Medical Info Service
 */
const updateMedicalInfo = async (userId, medicalData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // bloodGroup is stored at user top level
  if (medicalData.bloodGroup !== undefined) {
    user.bloodGroup = medicalData.bloodGroup;
  }

  // Update medicalInfo subdocument fields
  if (medicalData.medicalInfo && typeof medicalData.medicalInfo === 'object') {
    const medicalFields = [
      'allergies',
      'medicalConditions',
      'currentMedications',
      'doctorName',
      'doctorPhone',
      'organDonor',
      'wheelchairRequired',
      'additionalNotes',
    ];
    medicalFields.forEach((field) => {
      if (medicalData.medicalInfo[field] !== undefined) {
        user.medicalInfo[field] = medicalData.medicalInfo[field];
      }
    });
  }

  await user.save();
  return sanitizeUser(user);
};

/**
 * Update Emergency Settings Service
 */
const updateEmergencySettings = async (userId, settingsData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Update emergencySettings subdocument fields
  if (settingsData.emergencySettings && typeof settingsData.emergencySettings === 'object') {
    const settingsFields = [
      'shareLiveLocation',
      'autoSOS',
      'silentSOS',
      'locationUpdateInterval',
      'preferredLanguage',
      'receiveWeatherAlerts',
      'receiveDangerZoneAlerts',
    ];
    settingsFields.forEach((field) => {
      if (settingsData.emergencySettings[field] !== undefined) {
        user.emergencySettings[field] = settingsData.emergencySettings[field];
      }
    });
  }

  await user.save();
  return sanitizeUser(user);
};

/**
 * Calculate Profile Completeness Service
 */
const getProfileCompleteness = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }
  return calculateCompleteness(user);
};

/**
 * Delete Profile Image Service
 */
const deleteProfileImage = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  user.profileImage = null;
  await user.save();
  return sanitizeUser(user);
};

module.exports = {
  getProfile,
  updateProfile,
  updateMedicalInfo,
  updateEmergencySettings,
  getProfileCompleteness,
  deleteProfileImage,
};
