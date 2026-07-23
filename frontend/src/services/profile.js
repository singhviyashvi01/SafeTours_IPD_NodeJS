import { apiClient } from './apiClient';

export const profileService = {
  /**
   * GET /api/profile
   * Returns authenticated user profile object
   */
  getProfile: async () => {
    const response = await apiClient.get('/profile');
    return response.data.data.profile;
  },

  /**
   * PUT /api/profile
   * Updates main personal profile info (name, phone, address, nationality, languages, gender, dateOfBirth, profileImage)
   */
  updateProfile: async changes => {
    const payload = {};
    if (changes.name && changes.name.trim()) {
      payload.name = changes.name.trim();
    } else if (changes.username) {
      payload.name = changes.username;
    } else {
      payload.name = 'SafeTours User';
    }

    if (changes.phone && String(changes.phone).trim()) {
      payload.phone = String(changes.phone).trim();
    }

    if (changes.nationality && String(changes.nationality).trim()) {
      payload.nationality = String(changes.nationality).trim();
    }

    if (Array.isArray(changes.languages)) {
      payload.languages = changes.languages.map(l => String(l).trim()).filter(Boolean);
    }

    if (changes.gender && ['Male', 'Female', 'Other', 'Prefer not to say'].includes(changes.gender)) {
      payload.gender = changes.gender;
    }

    if (changes.dateOfBirth && String(changes.dateOfBirth).trim()) {
      payload.dateOfBirth = String(changes.dateOfBirth).trim();
    }

    if (changes.profileImage && String(changes.profileImage).trim()) {
      payload.profileImage = String(changes.profileImage).trim();
    }

    if (changes.address) {
      if (typeof changes.address === 'object' && !Array.isArray(changes.address)) {
        payload.address = changes.address;
      } else if (typeof changes.address === 'string' && changes.address.trim()) {
        payload.address = { street: changes.address.trim() };
      }
    }

    const response = await apiClient.put('/profile', payload);
    return response.data.data.profile;
  },

  /**
   * PUT /api/profile/medical
   * Updates medical info & blood group
   */
  updateMedical: async changes => {
    const info = changes.medicalInfo || changes || {};
    const bloodGroup = info.bloodGroup || changes.bloodGroup;
    const payload = {
      bloodGroup: bloodGroup && ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(bloodGroup) ? bloodGroup : undefined,
      medicalInfo: {
        allergies: info.allergies ? String(info.allergies) : '',
        medicalConditions: info.medicalConditions ? String(info.medicalConditions) : '',
        currentMedications: info.currentMedications ? String(info.currentMedications) : '',
        doctorName: info.doctorName ? String(info.doctorName) : '',
        doctorPhone: info.doctorPhone && String(info.doctorPhone).trim() ? String(info.doctorPhone).trim() : undefined,
        organDonor: Boolean(info.organDonor),
        wheelchairRequired: Boolean(info.wheelchairRequired),
        additionalNotes: info.additionalNotes ? String(info.additionalNotes) : '',
      },
    };

    const response = await apiClient.put('/profile/medical', payload);
    return response.data.data.profile;
  },

  /**
   * PUT /api/profile/settings
   * Updates emergency settings
   */
  updateSettings: async changes => {
    const settings = changes.emergencySettings || changes || {};
    const payload = {
      emergencySettings: {
        shareLiveLocation: Boolean(settings.shareLiveLocation ?? settings.shareLiveLocationWithContacts ?? true),
        autoSOS: Boolean(settings.autoSOS ?? settings.autoSosOnFall ?? false),
        silentSOS: Boolean(settings.silentSOS ?? false),
        receiveWeatherAlerts: Boolean(settings.receiveWeatherAlerts ?? true),
        receiveDangerZoneAlerts: Boolean(settings.receiveDangerZoneAlerts ?? true),
      },
    };

    const response = await apiClient.put('/profile/settings', payload);
    return response.data.data.profile;
  },

  /**
   * GET /api/profile/completeness
   * Returns completeness metrics object: { isComplete, percentage, missingFields }
   */
  getCompleteness: async () => {
    const response = await apiClient.get('/profile/completeness');
    return response.data.data;
  },

  /**
   * DELETE /api/profile/image
   * Clears profile image
   */
  deleteProfileImage: async () => {
    const response = await apiClient.delete('/profile/image');
    return response.data.data.profile;
  },
};
