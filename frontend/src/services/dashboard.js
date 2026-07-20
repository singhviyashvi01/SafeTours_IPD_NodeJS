export const dashboardService = {
    getDashboardData: async () => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve({
                    safetyScore: 92,
                    weather: {
                        temp: 24,
                        condition: 'Clear skies',
                        icon: 'sun'
                    },
                    connectivity: {
                        status: 'Excellent',
                        network: '5G'
                    },
                    aiRecommendations: [
                        'Stay hydrated. High temperatures expected this afternoon.',
                        'Your route to the hotel is currently well-lit and busy.',
                    ]
                });
            }, 500);
        });
    }
};
