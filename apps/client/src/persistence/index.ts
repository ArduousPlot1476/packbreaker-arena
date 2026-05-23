// Client-side persistence composer for M1.5b PR 3 / 5b.3a LocalSaveV1.
//
// Wraps the local storage primitives + the migration dispatcher into
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
//
// Layering: storage primitives (./storage) live client-side because
// they touch globalThis.localStorage; @packbreaker/shared stays
// types-only since apps/server imports it. See ./storage for the full
// Catch 19 / 5b.3a pre-push gate-clearance context.

import type { LocalSaveV1 } from '@packbreaker/shared';
import type { SaveStorageAdapter } from './storage';
import { loadRaw, save as storageSave } from './storage';
import { migrate } from './migrations';

export type { LocalSaveV1 } from '@packbreaker/shared';
export type { SaveStorageAdapter } from './storage';

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

/** Clear the in-progress run from the persisted save while
 *  PRESERVING all device-scoped envelope fields.
 *
 *  Per Phase 2.5g meta-audit (decision-log.md 2026-05-23 §
 *  M1.5c PR 1 Phase 2.5g / Codex P1 round 3): `LocalSaveV1`
 *  encodes two lifetime classes in one envelope — `inProgressRun`
 *  (run-scoped; cleared on terminal/abandon/reset) and the
 *  top-level cross-session fields (`telemetryAnonId`, `trophies`,
 *  `dailyStreak`, `lastDailyAttempted`, `tutorialCompleted`;
 *  device-scoped; survive run resets). The pre-fix removeItem
 *  primitive collapsed both classes into one operation,
 *  fragmenting `telemetryAnonId` across sessions (regenerated on
 *  every fresh mount after any terminal that cleared the key).
 *  The latent siblings (currently stubbed) would have hit the
 *  same bug when wired (cumulative trophies resetting on every
 *  abandon, daily streak resetting, tutorial re-firing, etc.).
 *
 *  New semantic: load → mutate → save the same envelope with
 *  `inProgressRun: null`. The resurrection guard at
 *  `useRun.ts:188` (`saved.inProgressRun === null`) already
 *  bails the restore branch on this shape — no changes needed
 *  to load-on-mount logic.
 *
 *  Throw-safety (Catch 21 lineage):
 *    - Read (loadLocal) is already throw-safe; returns null on
 *      any failure.
 *    - Read returns null when no save exists: NO-OP. Do NOT
 *      write a phantom envelope (that would create a save where
 *      there was none, surfacing as an unexpected pba.v1.save
 *      to consumers).
 *    - Write (saveLocal → storageSave) is already throw-safe;
 *      silent no-op on storage errors. If the write throws, the
 *      prior envelope persists — restore at next mount would see
 *      a terminal/abandoned outcome and bail at the resurrection
 *      guard's outcome check. Identical edge to the old
 *      removeItem-throws case; not a new regression.
 *
 *  Edge: `clearLocal` with no existing save = no-op (loadLocal
 *  returns null; we bail). Matches prior observable behavior. */
export function clearLocal(storage?: SaveStorageAdapter): void {
  const loaded = loadLocal(storage);
  if (loaded === null) return;
  saveLocal({ ...loaded, inProgressRun: null }, storage);
}
