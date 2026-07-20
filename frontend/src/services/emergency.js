export const emergencyService = {
    getNearbyServices: async () => {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        id: '1',
                        name: 'City General Hospital',
                        type: 'Hospital',
                        distance: '1.2 km',
                        phone: '911',
                        address: '123 Health Blvd, City Center',
                    },
                    {
                        id: '2',
                        name: 'Central Police Precinct',
                        type: 'Police',
                        distance: '2.5 km',
                        phone: '911',
                        address: '456 Law Ave, Downtown',
                    },
                    {
                        id: '3',
                        name: 'Women Helpline',
                        type: 'Helpline',
                        distance: 'N/A',
                        phone: '1091',
                        address: 'National Service',
                    },
                    {
                        id: '4',
                        name: 'Safe Haven Shelter',
                        type: 'Shelter',
                        distance: '3.0 km',
                        phone: '555-0199',
                        address: '789 Safe St, Westside',
                    }
                ]);
            }, 500);
        });
    }
};
