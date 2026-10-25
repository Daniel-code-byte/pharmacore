'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';

type ThemePreference = 'system' | 'light' | 'dark';
type AccentPreference = 'emerald' | 'blue' | 'violet' | 'rose' | 'amber';
type DensityPreference = 'comfortable' | 'compact';

export interface AppPreferences {
  theme: ThemePreference;
  accent: AccentPreference;
  density: DensityPreference;
  expiryWindowDays: 30 | 60 | 90 | 180;
  showExpiryWidget: boolean;
  showLowStockWidget: boolean;
  sidebarCollapsed: boolean;
}

const STORAGE_KEY = 'pharmacore_preferences';
const DEFAULTS: AppPreferences = {
  theme: 'system',
  accent: 'emerald',
  density: 'comfortable',
  expiryWindowDays: 90,
  showExpiryWidget: true,
  showLowStockWidget: true,
  sidebarCollapsed: false,
};

interface PreferencesContextValue {
  preferences: AppPreferences;
  ready: boolean;
  updatePreferences: (changes: Partial<AppPreferences>) => void;
  resetPreferences: () => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

function readPreferences(storageKey: string): AppPreferences {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return DEFAULTS;
    const parsed = JSON.parse(stored) as Partial<AppPreferences>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const { session, ready: authReady } = useAuth();
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULTS);
  const [loadedKey, setLoadedKey] = useState('');
  const storageKey = `${STORAGE_KEY}:${session?.user.id ?? 'guest'}`;
  const ready = authReady && loadedKey === storageKey;

  useEffect(() => {
    if (!authReady) return;
    setPreferences(readPreferences(storageKey));
    setLoadedKey(storageKey);
  }, [authReady, storageKey]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(storageKey, JSON.stringify(preferences));

    const root = document.documentElement;
    root.dataset.accent = preferences.accent;
    root.dataset.density = preferences.density;
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = preferences.theme === 'system'
      ? (systemDark ? 'dark' : 'light')
      : preferences.theme;
  }, [preferences, ready, storageKey]);

  const updatePreferences = useCallback((changes: Partial<AppPreferences>) => {
    setPreferences((current) => ({ ...current, ...changes }));
  }, []);

  const resetPreferences = useCallback(() => setPreferences(DEFAULTS), []);

  useEffect(() => {
    if (!ready || preferences.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const updateTheme = () => {
      document.documentElement.dataset.theme = media.matches ? 'dark' : 'light';
    };
    media.addEventListener('change', updateTheme);
    return () => media.removeEventListener('change', updateTheme);
  }, [preferences.theme, ready]);

  const value = useMemo(() => ({ preferences, ready, updatePreferences, resetPreferences }), [preferences, ready, updatePreferences, resetPreferences]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
