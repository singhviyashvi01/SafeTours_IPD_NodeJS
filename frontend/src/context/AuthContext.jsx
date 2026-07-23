import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/auth';
import { tokenStorage } from '../services/tokenStorage';
import { setUnauthorizedCallback, setAuthTokenHeader, formatApiError } from '../services/apiClient';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [isProfileComplete, setIsProfileComplete] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const clearError = () => setAuthError(null);

  const handleUnauthorized = useCallback(async () => {
    await tokenStorage.clearTokens();
    setAuthTokenHeader(null);
    setTokens(null);
    setUser(null);
    setIsLoading(false);
  }, []);

  // Restore session on app launch
  useEffect(() => {
    setUnauthorizedCallback(handleUnauthorized);

    const restoreSession = async () => {
      try {
        const [accessToken, refreshToken] = await Promise.all([
          tokenStorage.getAccessToken(),
          tokenStorage.getRefreshToken(),
        ]);

        if (!accessToken) {
          setIsLoading(false);
          return;
        }

        setAuthTokenHeader(accessToken);
        setTokens({ accessToken, refreshToken });

        // Fetch current user from backend
        const authenticatedUser = await authService.getMe();
        setUser(authenticatedUser);
        setIsProfileComplete(true);
      } catch (err) {
        console.warn('Session restoration failed:', err?.message || err);
        await tokenStorage.clearTokens();
        setAuthTokenHeader(null);
        setTokens(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, [handleUnauthorized]);

  const establishSession = async authData => {
    const { user: safeUser, accessToken, refreshToken } = authData;
    const nextTokens = { accessToken, refreshToken };

    await Promise.all([
      tokenStorage.saveAccessToken(accessToken),
      tokenStorage.saveRefreshToken(refreshToken),
    ]);

    setAuthTokenHeader(accessToken);
    setTokens(nextTokens);
    
    // If backend response included user info, set it; otherwise fetch from /me
    let currentUser = safeUser;
    if (!currentUser) {
      currentUser = await authService.getMe();
    }

    setUser(currentUser);
    setIsProfileComplete(true);
    setAuthError(null);
    return currentUser;
  };

  const login = async (email, password) => {
    setAuthError(null);
    try {
      const authData = await authService.login({ email, password });
      return await establishSession(authData);
    } catch (err) {
      const formatted = formatApiError(err);
      setAuthError(formatted);
      throw formatted;
    }
  };

  const signup = async (username, email, password) => {
    setAuthError(null);
    try {
      const authData = await authService.signup({ username, email, password });
      return await establishSession(authData);
    } catch (err) {
      const formatted = formatApiError(err);
      setAuthError(formatted);
      throw formatted;
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await tokenStorage.clearTokens();
      setAuthTokenHeader(null);
      setTokens(null);
      setUser(null);
      setAuthError(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshAccessToken = async () => {
    const currentRefresh = (await tokenStorage.getRefreshToken()) || tokens?.refreshToken;
    if (!currentRefresh) throw new Error('No refresh token available');

    const refreshed = await authService.refreshToken(currentRefresh);
    const nextTokens = {
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken || currentRefresh,
    };

    await Promise.all([
      tokenStorage.saveAccessToken(nextTokens.accessToken),
      tokenStorage.saveRefreshToken(nextTokens.refreshToken),
    ]);

    setAuthTokenHeader(nextTokens.accessToken);
    setTokens(nextTokens);
    return nextTokens.accessToken;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        currentUser: user,
        isAuthenticated: Boolean(user),
        accessToken: tokens?.accessToken || null,
        refreshToken: tokens?.refreshToken || null,
        tokens,
        isProfileComplete,
        isLoading,
        loading: isLoading,
        authError,
        clearError,
        login,
        signup,
        logout,
        refreshAccessToken,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
