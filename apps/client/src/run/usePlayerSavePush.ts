// Player-save PUSH callback (M2.1 CF-75) — PUSH DISABLED in CF-77 Phase 2 PR1.
//
// PR1 reshaped the server write DTO to the Delta trust-model
// ({runId, round, roundOutcome} — validation/playerSave.ts + schemas.ts §14).
// The previous CF-75 body ({trophies, lastDailyAttempted}) no longer type-checks
// or validates. Forming a real Delta body needs a per-run uuid + a per-round
// report — the PRODUCER — which lands in CF-77 Phase 2 PR2 together with the
// terminal-branch fix (useRun.ts:831-834). Until then this hook is a deliberate
// NO-OP: RunProvider keeps injecting `onQuiescentSave` unchanged (the return
// type is identical), and PR2 restores the real push here — reinstating the
// CF-75 gate (linked && hydrated, pull-before-push) alongside the producer.
// See decision-log.md 2026-07-17 § "CF-77 Phase 2 PR1 …".
//
// SCOPE NOTE: this file + its tests are the minimal client compile/test-compat
// touch a shared-DTO reshape forces (Halt #2 ruling, Option A). No producer or
// terminal-branch logic is added here — that is PR2, untouched.

import { useCallback } from 'react';
import type { LocalSaveV1 } from '@packbreaker/shared';

export function usePlayerSavePush(): (save: LocalSaveV1) => void {
  // No-op until CF-77 Phase 2 PR2 wires the Delta-body producer. Kept as a hook
  // (not deleted) so RunProvider's injection and every call site stay untouched.
  return useCallback((_save: LocalSaveV1) => {
    // intentionally empty — see file header
  }, []);
}
