'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from './api';
import { clearSession, loadSession, saveSession } from './session';
import type { LoginResponse, Role } from './types';

interface AuthState {
  session: LoginResponse | null;
  ready: boolean;
  login: (pharmacy: string, email: string, password: string) => Promise<void>;
  setSession: (s: LoginResponse) => void;
  logout: () => Promise<void>;
  role: Role | null;
  canWrite: boolean;   // add/edit drugs, receive stock
  canAdjust: boolean;  // stock corrections and write-offs
  canDelete: boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSessionState] = useState<LoginResponse | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSessionState(loadSession());
    setReady(true);
  }, []);

  const setSession = useCallback((s: LoginResponse) => {
    saveSession(s);
    setSessionState(s);
  }, []);

  const login = useCallback(async (pharmacy: string, email: string, password: string) => {
    const res = await api<LoginResponse>('/login', { method: 'POST', body: { pharmacy, email, password } });
    setSession(res);
  }, [setSession]);

  const logout = useCallback(async () => {
    try { await api('/logout', { method: 'POST' }); } catch { /* token may already be invalid */ }
    clearSession();
    setSessionState(null);
    router.replace('/login');
  }, [router]);

  const role = session?.user.role ?? null;

  return (
    <Ctx.Provider
      value={{
        session, ready, login, setSession, logout, role,
        canWrite: !!role && ['owner', 'admin', 'pharmacist', 'stock_clerk'].includes(role),
        canAdjust: !!role && ['owner', 'admin', 'pharmacist'].includes(role),
        canDelete: !!role && ['owner', 'admin'].includes(role),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
