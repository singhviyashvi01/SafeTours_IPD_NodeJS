import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'safetours_access_token';
const REFRESH_TOKEN_KEY = 'safetours_refresh_token';

// In-memory fallback if SecureStore and localStorage are both unavailable
let inMemoryAccessToken = null;
let inMemoryRefreshToken = null;

const isWeb = Platform.OS === 'web';

const setItem = async (key, value) => {
  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      } else {
        if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = value;
        if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = value;
      }
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch (error) {
    console.warn(`SecureStore setItem failed for ${key}, falling back to memory:`, error);
    if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = value;
    if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = value;
  }
};

const getItem = async key => {
  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return key === ACCESS_TOKEN_KEY ? inMemoryAccessToken : inMemoryRefreshToken;
    }
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    console.warn(`SecureStore getItem failed for ${key}, checking fallback:`, error);
    return key === ACCESS_TOKEN_KEY ? inMemoryAccessToken : inMemoryRefreshToken;
  }
};

const deleteItem = async key => {
  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
      if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = null;
      if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = null;
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch (error) {
    console.warn(`SecureStore deleteItem failed for ${key}:`, error);
    if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = null;
    if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = null;
  }
};

export const tokenStorage = {
  saveAccessToken: async value => {
    if (!value) return deleteItem(ACCESS_TOKEN_KEY);
    await setItem(ACCESS_TOKEN_KEY, value);
  },
  saveRefreshToken: async value => {
    if (!value) return deleteItem(REFRESH_TOKEN_KEY);
    await setItem(REFRESH_TOKEN_KEY, value);
  },
  getAccessToken: async () => {
    return await getItem(ACCESS_TOKEN_KEY);
  },
  getRefreshToken: async () => {
    return await getItem(REFRESH_TOKEN_KEY);
  },
  clearTokens: async () => {
    await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
    inMemoryAccessToken = null;
    inMemoryRefreshToken = null;
  },
};
