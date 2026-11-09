import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  getAccessToken,
  setAccessToken as saveAccessToken,
  removeAccessToken,
  USER_STORAGE_KEY,
} from '../api/client';
import { getMeApi, loginApi, logoutApi, UserDto } from '../api/authApi';

interface AuthContextType {
  user: UserDto | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
  const [accessToken, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    setTokenState(token);
    // Restore user from cache first for fast render
    try {
      const cached = localStorage.getItem(USER_STORAGE_KEY);
      if (cached) {
        setUser(JSON.parse(cached));
      }
    } catch {
      // ignore
    }

    // Verify token with backend
    getMeApi()
      .then((userData) => {
        setUser(userData);
        localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
      })
      .catch(() => {
        removeAccessToken();
        setUser(null);
        setTokenState(null);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await loginApi({ username, password });
      saveAccessToken(res.accessToken);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
      setTokenState(res.accessToken);
      setUser(res.user);
      await router.push('/');
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    logoutApi().catch(() => {});
    removeAccessToken();
    setUser(null);
    setTokenState(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!accessToken,
        isLoading,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
