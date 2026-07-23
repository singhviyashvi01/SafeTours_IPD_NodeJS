import { delay } from './mockStore';
const data = [{ id: 'journey-1', destination: 'Victoria Station', eta: '18:45', status: 'completed', startedAt: '2026-07-17T18:20:00Z', lastLocation: { latitude: 51.503, longitude: -0.119, address: 'Victoria, London' }, timeline: [{ title: 'Journey started', time: '18:20' }, { title: 'Safe arrival', time: '18:45' }] }];
export const journeyService = { list: () => delay([...data]), getActive: () => delay({ ...data[0], status: 'monitoring' }) };
