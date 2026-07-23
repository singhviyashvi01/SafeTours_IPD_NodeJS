import { delay } from './mockStore';

let mockUser = null;
const tokensFor = email => ({ accessToken: `mock-access-token-${email}`, refreshToken: `mock-refresh-token-${email}` });

export const authService = {
  // POST /api/auth/signup { username, email, password }
  signup: async ({ username, email, password }) => {
    if (!username || !email || !password) throw new Error('Username, email, and password are required.');
    mockUser = { id: 'mock-user-1', username, email };
    return delay({ ...tokensFor(email), user: mockUser });
  },
  // POST /api/auth/login { email, password }
  login: async ({ email, password }) => {
    if (!email || !password) throw new Error('Email and password are required.');
    mockUser = mockUser || { id: 'mock-user-1', username: email.split('@')[0], email };
    return delay({ ...tokensFor(email), user: mockUser });
  },
  // GET /api/auth/me (Bearer access token)
  getMe: async accessToken => {
    if (!accessToken) throw new Error('Authentication required.');
    if (!mockUser) {
      const email = accessToken.replace('mock-access-token-', '') || 'traveler@example.com';
      mockUser = { id: 'mock-user-1', username: email.split('@')[0], email };
    }
    return delay(mockUser);
  },
  // POST /api/auth/refresh-token { refreshToken }
  refreshToken: async refreshToken => {
    if (!refreshToken || !mockUser) throw new Error('Refresh token is required.');
    return delay(tokensFor(mockUser.email));
  },
};
