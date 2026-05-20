// Low-level localStorage R/W primitives for the M1 LocalSave path.
// Namespaced under `pba.v1.save` per tech-architecture.md § 6.1
// ("Local saves use localStorage, namespaced under `pba.v1.*`").
//
// Layering: these primitives live client-side because the apps/server
// package imports @packbreaker/shared (types crossing the client/server
// boundary); shared must stay types-only. Pre-Catch-19 these primitives
// lived in packages/shared/src/save/storage.ts; they were relocated here
// in the 5b.3a pre-push gate-clearance pass after the master-dev layering
// audit caught the runtime globalThis.localStorage access.
//
// The primitives are deliberately dumb: save() serializes a typed
// LocalSaveV1, loadRaw() returns the parsed-but-unmigrated payload as
// `unknown`, clearSave() deletes the key. Version validation + migration
// chain dispatch lives at apps/client/src/persistence/migrations/.
//
// SSR / non-browser environments (where globalThis.localStorage is
// undefined) silently no-op on save/clearSave and return null on
// loadRaw. The client persistence composer treats null-from-loadRaw the
// same as "no save present" — fresh-run path.

import type { LocalSaveV1 } from '@packbreaker/shared';

export const SAVE_STORAGE_KEY = 'pba.v1.save';

/** Minimal storage interface satisfied by the browser's Storage type
 *  (window.localStorage / sessionStorage) and by simple in-memory test
 *  doubles. Pass a custom adapter for unit tests; default is
 *  globalThis.localStorage when available. */
export interface SaveStorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function getDefaultStorage(): SaveStorageAdapter | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { localStorage?: SaveStorageAdapter };
  return g.localStorage ?? null;
}

/** Serialize a LocalSaveV1 payload to JSON and write to local storage.
 *  No-op when no storage adapter is available (SSR, non-browser). */
export function save(payload: LocalSaveV1, storage?: SaveStorageAdapter): void {
  const adapter = storage ?? getDefaultStorage();
  if (!adapter) return;
  adapter.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
}

/** Read + JSON.parse the saved payload, returning the unmigrated shape
 *  as `unknown`. Returns null when:
 *    - no storage adapter is available,
 *    - the key is absent,
 *    - the stored value is not valid JSON.
 *
 *  The caller (apps/client/src/persistence/migrations/) is responsible
 *  for schemaVersion validation + migration chain dispatch. */
export function loadRaw(storage?: SaveStorageAdapter): unknown {
  const adapter = storage ?? getDefaultStorage();
  if (!adapter) return null;
  const raw = adapter.getItem(SAVE_STORAGE_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Remove the persisted save. No-op when no storage adapter is available. */
export function clearSave(storage?: SaveStorageAdapter): void {
  const adapter = storage ?? getDefaultStorage();
  if (!adapter) return;
  adapter.removeItem(SAVE_STORAGE_KEY);
}
