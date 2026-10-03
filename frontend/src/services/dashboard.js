import { apiClient } from './apiClient';
import { riskService } from './riskService';

export const dashboardService = {
    // Backend-owned values for the device's real location: the cell's composite risk (with data
    // confidence) and the current weather. The app never recomputes risk itself.
    getDashboardData: async (latitude, longitude) => {
        const [riskResult, weatherResponse] = await Promise.all([
            riskService.getLocationRisk(latitude, longitude),
            apiClient.get('/weather', { params: { lat: latitude, lon: longitude } }).catch(() => null),
        ]);

        if (!riskResult.success) {
            throw new Error(riskResult.error?.message || 'Could not load the area risk.');
        }

        return {
            risk: riskResult.data,
            weather: weatherResponse?.data?.data || null,
        };
    },
};
