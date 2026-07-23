import { profileService } from './profile';

export const medicalService = {
  get: async () => {
    const profile = await profileService.getProfile();
    return {
      ...(profile?.medical || {}),
      bloodGroup: profile?.medical?.bloodGroup || profile?.bloodGroup || '',
    };
  },
  update: async changes => {
    const profile = await profileService.updateMedical(changes);
    return profile?.medical || {};
  },
};
