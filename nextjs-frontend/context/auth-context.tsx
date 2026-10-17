'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api } from '@/lib/api';
import { getAuthToken, removeAuthToken, TOKEN_STORAGE_KEY } from '@/lib/auth';
import type { User, LoginCredentials, RegisterPayload, UpdateProfilePayload } from '@/types/auth';

export interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
  register: (payload: RegisterPayload) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<User>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    const currentToken = getAuthToken();
    if (!currentToken) {
      setUser(null);
      setTokenState(null);
      setLoading(false);
      return null;
    }

    setTokenState(currentToken);
    try {
      const res = await api.getMe(currentToken);
      if (res && res.authenticated && res.user) {
        setUser(res.user);
        return res.user;
      }
    } catch {
      // Token expired or invalid on backend
    }

    // Clear stale token
    removeAuthToken();
    setUser(null);
    setTokenState(null);
    setLoading(false);
    return null;
  }, []);

  const login = useCallback(async (credentials: LoginCredentials): Promise<User> => {
    const res = await api.login(credentials);
    setTokenState(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<User> => {
    const res = await api.register(payload);
    setTokenState(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } catch {
      // Disregard network errors on sign-out
    } finally {
      removeAuthToken();
      setUser(null);
      setTokenState(null);
    }
  }, []);

  const updateProfile = useCallback(async (payload: UpdateProfilePayload): Promise<User> => {
    const res = await api.updateProfile(payload);
    setUser(res.user);
    return res.user;
  }, []);

  // Initial session hydration
  useEffect(() => {
    refreshUser().finally(() => {
      setLoading(false);
    });
  }, [refreshUser]);

  // Synchronize across browser tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_STORAGE_KEY) {
        refreshUser();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refreshUser]);

  const value: AuthContextType = {
    user,
    token,
    loading,
    isAuthenticated: Boolean(user && token),
    login,
    register,
    logout,
    refreshUser,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
