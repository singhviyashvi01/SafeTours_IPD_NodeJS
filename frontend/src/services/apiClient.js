import axios from 'axios';
import { Platform } from 'react-native';
import { tokenStorage } from './tokenStorage';

// Base URL configuration for Expo Dev / Web / Android Emulator / Production
const getBaseUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:5001/api';
  }
  return 'http://localhost:5001/api';
};

export const BASE_URL = getBaseUrl();

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Event listener mechanism for unauthorized (401) logout handling
let onUnauthorizedCallback = null;

export const setUnauthorizedCallback = callback => {
  onUnauthorizedCallback = callback;
};

// Request Interceptor: Attach JWT access token automatically
apiClient.interceptors.request.use(
  async config => {
    try {
      const token = await tokenStorage.getAccessToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (err) {
      console.warn('Error reading access token in request interceptor:', err);
    }
    return config;
  },
  error => Promise.reject(error)
);

// Response Interceptor: Handle 401 and refresh tokens
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    // Do not attempt refresh on auth endpoints (login, signup, refresh-token)
    const isAuthRoute =
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/signup') ||
      originalRequest.url?.includes('/auth/refresh-token');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const storedRefreshToken = await tokenStorage.getRefreshToken();
        if (!storedRefreshToken) {
          throw new Error('No refresh token available');
        }

        // Call backend refresh token endpoint
        const refreshResponse = await axios.post(`${BASE_URL}/auth/refresh-token`, {
          refreshToken: storedRefreshToken,
        });

        const { accessToken, refreshToken: newRefreshToken } = refreshResponse.data.data;

        await tokenStorage.saveAccessToken(accessToken);
        if (newRefreshToken) {
          await tokenStorage.saveRefreshToken(newRefreshToken);
        }

        apiClient.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        processQueue(null, accessToken);
        return apiClient(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        await tokenStorage.clearTokens();
        if (onUnauthorizedCallback) {
          onUnauthorizedCallback();
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Helper to format API errors consistently across screens & services
 */
export const formatApiError = error => {
  if (!error) {
    return { message: 'An unknown error occurred.', status: 0, fieldErrors: {} };
  }

  if (typeof error === 'string') {
    return { message: error, status: 0, fieldErrors: {} };
  }

  if (!error.response) {
    return {
      message: error.message || 'Network error. Please check your connection to SafeTours backend.',
      status: 0,
      fieldErrors: {},
    };
  }

  const data = error.response.data || {};
  const status = error.response.status;
  const message = data.message || (status === 401 ? 'Unauthorized session' : 'An error occurred');

  const fieldErrors = {};
  if (Array.isArray(data.errors)) {
    data.errors.forEach(err => {
      if (err.field && err.message) {
        fieldErrors[err.field] = err.message;
      }
    });
  }

  return {
    message,
    status,
    fieldErrors,
  };
};
