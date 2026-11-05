import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { authApi, getApiError, userApi } from '../api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem('rice-price-token')) {
      setLoading(false);
      return;
    }
    userApi
      .me()
      .then(({ data }) => setUser(data.user))
      .catch(() => {
        localStorage.removeItem('rice-price-token');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const establishSession = useCallback((data) => {
    localStorage.setItem('rice-price-token', data.token);
    setUser(data.user);
  }, []);

  const login = useCallback(async (credentials) => {
    try {
      const { data } = await authApi.login(credentials);
      establishSession(data);
      return data.user;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  }, [establishSession]);

  const register = useCallback(async (details) => {
    try {
      const { data } = await authApi.register(details);
      establishSession(data);
      return data.user;
    } catch (error) {
      throw new Error(getApiError(error));
    }
  }, [establishSession]);

  const logout = useCallback(() => {
    localStorage.removeItem('rice-price-token');
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUser) => setUser(updatedUser), []);
  const value = useMemo(
    () => ({ user, loading, login, register, logout, updateUser }),
    [user, loading, login, register, logout, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}