// Settings provider. Kept separate from RunProvider: settings outlive runs, and
// nothing here may participate in the run's save/restore lifecycle.
//
// Also applies the reduced-motion preference as a `data-reduced-motion`
// attribute on <html>, which index.css keys off. Doing it here rather than at
// each animation site means a future animation is covered by default instead of
// having to remember.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadSettings, saveSettings, type PlayerSettings } from './settings';

interface SettingsContextValue {
  readonly settings: PlayerSettings;
  readonly update: (patch: Partial<PlayerSettings>) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PlayerSettings>(() => loadSettings());

  const update = useCallback((patch: Partial<PlayerSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (settings.reducedMotion) root.setAttribute('data-reduced-motion', 'true');
    else root.removeAttribute('data-reduced-motion');
  }, [settings.reducedMotion]);

  const value = useMemo(() => ({ settings, update }), [settings, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

/** Settings + updater. Falls back to defaults outside a provider so a component
 *  rendered in isolation (a test, a storybook-style mount) still works. */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (ctx !== null) return ctx;
  return { settings: loadSettings(), update: () => {} };
}
