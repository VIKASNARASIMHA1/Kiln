import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, ApiError, tokenStore } from '../api/client';
import type { Track, User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, track: Track) => Promise<void>;
  guest: (role: 'student' | 'teacher') => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
type AuthResponse = { token: string; user: User };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) return setUser(null);
    try {
      setUser((await api<{ user: User }>('/auth/me')).user);
    } catch (e) {
      // Only a real 401 means the token is bad. Network hiccups and aborted requests must not sign people out.
      if (e instanceof ApiError && e.status === 401) tokenStore.clear();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const accept = (r: AuthResponse) => {
    tokenStore.set(r.token);
    setUser(r.user);
  };

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      refresh,
      login: async (email, password) => accept(await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } })),
      register: async (name, email, password, track) =>
        accept(await api<AuthResponse>('/auth/register', { method: 'POST', body: { name, email, password, track } })),
      guest: async (role) => accept(await api<AuthResponse>('/auth/guest', { method: 'POST', body: { role } })),
      logout: () => {
        tokenStore.clear();
        setUser(null);
      },
    }),
    [user, loading, refresh]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuthContext() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
