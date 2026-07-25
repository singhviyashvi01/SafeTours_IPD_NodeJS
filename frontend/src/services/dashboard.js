import { apiClient } from './apiClient';
import { dangerZoneService } from './dangerZoneService';

export const dashboardService = {
    // Fetch the backend-owned safety values for the device's real location.
    // This keeps the screen from recreating a crime or risk calculation in the app.
    getDashboardData: async (latitude, longitude) => {
        const [crimeResult, weatherResponse] = await Promise.all([
            dangerZoneService.getCrimeScore(latitude, longitude),
            apiClient.get('/weather', { params: { lat: latitude, lon: longitude } }),
        ]);

        if (!crimeResult.success) {
            throw new Error(crimeResult.error?.message || 'Could not load the crime score.');
        }

        return {
            crime: crimeResult.data,
            weather: weatherResponse.data?.data || null,
        };
    },
};
