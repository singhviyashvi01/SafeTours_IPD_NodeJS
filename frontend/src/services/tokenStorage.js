// Temporary development storage. Keep this abstraction so SecureStore can be
// restored later without changing authentication consumers.
let accessToken = null;
let refreshToken = null;

export const tokenStorage = {
  saveAccessToken: value => { accessToken = value; return Promise.resolve(); },
  saveRefreshToken: value => { refreshToken = value; return Promise.resolve(); },
  getAccessToken: () => Promise.resolve(accessToken),
  getRefreshToken: () => Promise.resolve(refreshToken),
  clearTokens: () => { accessToken = null; refreshToken = null; return Promise.resolve(); },
};
