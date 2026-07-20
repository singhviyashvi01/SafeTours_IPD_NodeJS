import { profileService } from './profile';

export const medicalService = {
  get: async () => (await profileService.getProfile()).medical,
  update: changes => profileService.updateMedical(changes),
};
