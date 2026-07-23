import { delay } from './mockStore';
const data = [{ id: 'sos-1', status: 'resolved', triggeredAt: '2026-07-15T21:15:00Z', location: { latitude: 51.5, longitude: -0.12, address: 'Central Station' }, details: 'Mock SOS event' }];
export const sosService = { list: () => delay([...data]), trigger: item => delay({ id: `sos-${Date.now()}`, ...item }) };
