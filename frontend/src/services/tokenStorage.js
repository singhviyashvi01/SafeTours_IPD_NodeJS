import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'safetours_access_token';
const REFRESH_TOKEN_KEY = 'safetours_refresh_token';

// Synchronous in-memory cache to prevent async storage retrieval lag
let inMemoryAccessToken = null;
let inMemoryRefreshToken = null;

const isWeb = Platform.OS === 'web';

const setItem = async (key, value) => {
  if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = value;
  if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = value;

  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch (error) {
    console.warn(`SecureStore setItem failed for ${key}, using memory fallback:`, error);
  }
};

const getItem = async key => {
  const cachedValue = key === ACCESS_TOKEN_KEY ? inMemoryAccessToken : inMemoryRefreshToken;
  if (cachedValue) return cachedValue;

  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        const val = window.localStorage.getItem(key);
        if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = val;
        if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = val;
        return val;
      }
      return cachedValue;
    }
    const val = await SecureStore.getItemAsync(key);
    if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = val;
    if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = val;
    return val;
  } catch (error) {
    console.warn(`SecureStore getItem failed for ${key}, using memory fallback:`, error);
    return cachedValue;
  }
};

const deleteItem = async key => {
  if (key === ACCESS_TOKEN_KEY) inMemoryAccessToken = null;
  if (key === REFRESH_TOKEN_KEY) inMemoryRefreshToken = null;

  try {
    if (isWeb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch (error) {
    console.warn(`SecureStore deleteItem failed for ${key}:`, error);
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
    inMemoryAccessToken = null;
    inMemoryRefreshToken = null;
    await Promise.all([deleteItem(ACCESS_TOKEN_KEY), deleteItem(REFRESH_TOKEN_KEY)]);
  },
};
