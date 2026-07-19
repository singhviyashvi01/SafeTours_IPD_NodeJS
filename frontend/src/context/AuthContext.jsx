import React, { createContext, useContext, useEffect, useState } from 'react';
import { authService } from '../services/auth';
import { profileService } from '../services/profile';
import { tokenStorage } from '../services/tokenStorage';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [isProfileComplete, setIsProfileComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfileCompleteness = async () => {
    const result = await profileService.getCompleteness();
    setIsProfileComplete(result.isComplete);
    return result.isComplete;
  };

  useEffect(() => {
    const restoreSession = async () => {
      try {
        const [accessToken, refreshToken] = await Promise.all([tokenStorage.getAccessToken(), tokenStorage.getRefreshToken()]);
        if (!accessToken || !refreshToken) return;
        const authenticatedUser = await authService.getMe(accessToken);
        setTokens({ accessToken, refreshToken });
        setUser(authenticatedUser);
        setIsProfileComplete(true);
      } catch {
        await tokenStorage.clearTokens();
      } finally {
        setIsLoading(false);
      }
    };
    restoreSession();
  }, []);

  const establishSession = async authResponse => {
    const nextTokens = { accessToken: authResponse.accessToken, refreshToken: authResponse.refreshToken };
    await Promise.all([tokenStorage.saveAccessToken(nextTokens.accessToken), tokenStorage.saveRefreshToken(nextTokens.refreshToken)]);
    const authenticatedUser = authResponse.user || await authService.getMe(nextTokens.accessToken);
    setTokens(nextTokens);
    setUser(authenticatedUser);
    // Mock authentication always enters the application directly.
    setIsProfileComplete(true);
  };

  const login = async (email, password) => {
    setIsLoading(true);
    try { await establishSession(await authService.login({ email, password })); }
    finally { setIsLoading(false); }
  };

  const signup = async (username, email, password) => {
    setIsLoading(true);
    try { await establishSession(await authService.signup({ username, email, password })); }
    finally { setIsLoading(false); }
  };

  const refreshAccessToken = async () => {
    if (!tokens?.refreshToken) throw new Error('No refresh token is available.');
    const refreshed = await authService.refreshToken(tokens.refreshToken);
    const nextTokens = { accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken || tokens.refreshToken };
    await Promise.all([tokenStorage.saveAccessToken(nextTokens.accessToken), tokenStorage.saveRefreshToken(nextTokens.refreshToken)]);
    setTokens(nextTokens);
    return nextTokens.accessToken;
  };

  const completeProfile = async () => setIsProfileComplete(await loadProfileCompleteness());
  const logout = async () => { await tokenStorage.clearTokens(); setTokens(null); setUser(null); setIsProfileComplete(false); };

  return <AuthContext.Provider value={{ currentUser: user, user, isAuthenticated: Boolean(user), accessToken: tokens?.accessToken || null, refreshToken: tokens?.refreshToken || null, tokens, isProfileComplete, isLoading, login, signup, logout, refreshAccessToken, completeProfile, setUser }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
