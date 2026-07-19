import { delay, profile } from './mockStore';

const clone = value => JSON.parse(JSON.stringify(value));

export const profileService = {
  // GET /api/profile
  getProfile: () => delay(clone(profile)),
  // PUT /api/profile
  updateProfile: async changes => {
    Object.assign(profile, changes);
    return delay(clone(profile));
  },
  // PUT /api/profile/medical
  updateMedical: async changes => {
    Object.assign(profile.medical, changes);
    return delay(clone(profile.medical));
  },
  // PUT /api/profile/settings
  updateSettings: async changes => {
    Object.assign(profile.settings, changes);
    return delay(clone(profile.settings));
  },
  // GET /api/profile/completeness
  getCompleteness: () => delay({ isComplete: Boolean(profile.name && profile.phone && profile.address && profile.nationality) }),
  // DELETE /api/profile/image
  deleteProfileImage: async () => {
    profile.profileImage = '';
    return delay(clone(profile));
  },
};
