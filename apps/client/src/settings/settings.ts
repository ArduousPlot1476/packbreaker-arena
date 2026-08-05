// Device-scoped player settings.
//
// Deliberately NOT stored in LocalSaveV1. That envelope is the run save — it is
// cleared on abandon, replaced wholesale by the server on sign-in, and versioned
// against a schema. Settings have a different lifetime entirely: they belong to
// this browser, survive every run, and must never be reachable by a save
// migration or a server overwrite. Two lifetimes, two keys (the split CF 52
// names for the run-save envelope, applied here from the start rather than
// unpicked later).
//
// Reads are total: any parse failure, any missing field, any out-of-range value
// falls back to the default for that field alone. A corrupt settings blob must
// never be able to stop the game from starting.

export const SETTINGS_STORAGE_KEY = 'pba.settings.v1';

/** Combat playback speed multiplier (CF 10). 1 is the authored cadence. */
export const COMBAT_SPEEDS = [1, 2, 4] as const;
export type CombatSpeed = (typeof COMBAT_SPEEDS)[number];

export interface PlayerSettings {
  /** Suppress non-essential motion. Defaults to the OS preference, but the
   *  player can override it in either direction — some people want motion off
   *  without setting it system-wide, and some have it on system-wide for other
   *  reasons and still want the game's juice. */
  readonly reducedMotion: boolean;
  /** Playback multiplier applied to the combat tick clock. */
  readonly combatSpeed: CombatSpeed;
}

/** True when the OS asks for reduced motion. Safe in non-DOM environments. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function defaultSettings(): PlayerSettings {
  return { reducedMotion: prefersReducedMotion(), combatSpeed: 1 };
}

function isCombatSpeed(v: unknown): v is CombatSpeed {
  return COMBAT_SPEEDS.includes(v as CombatSpeed);
}

export function loadSettings(): PlayerSettings {
  const fallback = defaultSettings();
  if (typeof localStorage === 'undefined') return fallback;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    // Storage can be denied outright (private mode, blocked cookies). Play on.
    return fallback;
  }
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return fallback;
    const o = parsed as Record<string, unknown>;
    return {
      // Per-field fallback, not all-or-nothing: a settings file written by an
      // older build that lacks a field should keep the fields it does have.
      reducedMotion:
        typeof o.reducedMotion === 'boolean' ? o.reducedMotion : fallback.reducedMotion,
      combatSpeed: isCombatSpeed(o.combatSpeed) ? o.combatSpeed : fallback.combatSpeed,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: PlayerSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Quota or denial. Settings are a convenience; losing them is not a failure
    // worth surfacing mid-run.
  }
}
