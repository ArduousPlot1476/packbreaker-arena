// Client-side persistence composer for M1.5b PR 3 / 5b.3a LocalSaveV1.
//
// Wraps the shared storage primitives + the migration dispatcher into
// the client-facing save/load surface. Higher-level composition of a
// LocalSaveV1 payload from sim + client state lives in apps/client/src/
// run/useRun.ts (the only consumer with both ClientRunState and a live
// simRun in scope).
//
// Per Phase 1 ratification:
//   - save() fires at quiescent points only: arranging-entry (post
//     combat_done shop regen) and terminal outcome.
//   - load() runs on RunProvider mount; if a v1 in-progress run is
//     present, the simRun is rebuilt via restoreRun() and the client
//     state hydrates from the SerializedRunState.

import type {
  LocalSaveV1,
  SaveStorageAdapter,
} from '@packbreaker/shared';
import {
  clearSave as storageClear,
  loadRaw,
  save as storageSave,
} from '@packbreaker/shared';
import { migrate } from './migrations';

export type { LocalSaveV1, SaveStorageAdapter } from '@packbreaker/shared';

/** Write a LocalSaveV1 to local storage. Pass a custom storage adapter
 *  for tests; default is globalThis.localStorage (SSR-safe — silent
 *  no-op when localStorage is unavailable). */
export function saveLocal(payload: LocalSaveV1, storage?: SaveStorageAdapter): void {
  storageSave(payload, storage);
}

/** Load + migrate the persisted save. Returns null when:
 *    - no save is present in storage,
 *    - the stored value is unparseable JSON,
 *    - the payload's schemaVersion is unrecognized (corrupt / future).
 *  Callers proceed with a fresh-run path on null. */
export function loadLocal(storage?: SaveStorageAdapter): LocalSaveV1 | null {
  return migrate(loadRaw(storage));
}

/** Remove the persisted save. SSR-safe (silent no-op). */
export function clearLocal(storage?: SaveStorageAdapter): void {
  storageClear(storage);
}
