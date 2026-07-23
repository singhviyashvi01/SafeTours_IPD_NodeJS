import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authService } from '../services/auth';
import { tokenStorage } from '../services/tokenStorage';
import { setUnauthorizedCallback, formatApiError } from '../services/apiClient';

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

        // Fetch current user from backend
        const authenticatedUser = await authService.getMe();
        setTokens({ accessToken, refreshToken });
        setUser(authenticatedUser);
        setIsProfileComplete(true);
      } catch (err) {
        console.warn('Session restoration failed:', err?.message || err);
        await tokenStorage.clearTokens();
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

    setTokens(nextTokens);
    
    // If backend response included user info, set it; otherwise fetch from /me
    const currentUser = safeUser || (await authService.getMe());
    setUser(currentUser);
    setIsProfileComplete(true);
    setAuthError(null);
    return currentUser;
  };

  const login = async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const authData = await authService.login({ email, password });
      return await establishSession(authData);
    } catch (err) {
      const formatted = formatApiError(err);
      setAuthError(formatted);
      throw formatted;
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (username, email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const authData = await authService.signup({ username, email, password });
      return await establishSession(authData);
    } catch (err) {
      const formatted = formatApiError(err);
      setAuthError(formatted);
      throw formatted;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await tokenStorage.clearTokens();
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
