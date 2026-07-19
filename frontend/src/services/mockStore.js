export const delay = (value, ms = 300) => new Promise(resolve => setTimeout(() => resolve(value), ms));
export let contacts = [{ id: 'contact-1', name: 'John Doe', relationship: 'Brother', phone: '+1 987 654 3210', isPrimary: true }];
export let profile = {
  name: '', phone: '', address: '', nationality: '', languages: [], gender: '', dateOfBirth: '', profileImage: '',
  medical: { bloodGroup: '', allergies: '', medicalConditions: '', currentMedications: '', doctorName: '', doctorPhone: '', additionalNotes: '', organDonor: false, wheelchairRequired: false },
  settings: { shareLiveLocation: true, autoSOS: false, silentSOS: false, receiveWeatherAlerts: true, receiveDangerZoneAlerts: true, locationUpdateInterval: 15, preferredLanguage: 'English' },
};
