import { BASE_URL, apiClient } from '../services/apiClient';

export { BASE_URL };

export const createAuthorizationHeaders = accessToken => 
  accessToken ? { Authorization: `Bearer ${accessToken}` } : {};

export const apiGet = async (endpoint, params = {}) => {
  try {
    const response = await apiClient.get(endpoint, { params });
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const apiPost = async (endpoint, payload = {}) => {
  try {
    const response = await apiClient.post(endpoint, payload);
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error };
  }
};

export const initSocketConnection = () => {
  console.log('Socket initialized with base URL:', BASE_URL);
};
