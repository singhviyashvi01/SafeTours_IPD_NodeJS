import { delay } from './mockStore';
let data = [{ id: 'notification-1', title: 'Shadow Mode active', body: 'Your journey is being monitored.', type: 'journey', read: false, createdAt: 'Just now' }];
export const notificationService = { list: () => delay([...data]), markRead: async id => { data = data.map(item => item.id === id ? { ...item, read: true } : item); return delay(); } };
