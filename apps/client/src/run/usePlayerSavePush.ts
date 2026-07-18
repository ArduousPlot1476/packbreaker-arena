// Player-save PUSH callback (M2.1 CF-77 Phase 2 PR2) — the per-round Delta push.
//
// PR1 reshaped the server write DTO to the Delta trust-model
// (PlayerSaveWriteRequest = {runId, round, roundOutcome, lastDailyAttempted});
// the server derives the trophy delta via trophyDeltaFor and applies it AT MOST
// ONCE per (account, run, round) via an idempotency record. This hook returns
// the callback useRun's per-round PRODUCER effect invokes with one completed
// round (decision-log.md 2026-07-18 § "CF-77 Phase 2 PR2 — PHASE 1 RATIFIED",
// R1/R7); RunProvider wraps it in a session-scoped ordered-delivery queue (R5).
// The client NEVER sends a trophy value — the server owns the schedule.
//
// Gated on signed-in + linked AND the initial pull having settled (hydrated) —
// the pull-before-push serialization from CF-75 (Codex round 1 P1), so a push
// can't be clobbered by an in-flight GET's stale hydration. Anonymous /
// signed-out sessions read the AccountLinkContext defaults (false) and never
// push. `lastDailyAttempted` stays a DELIBERATE hardcoded null (R9, CF-76
// bounded posture) — the client has no honest daily attempt to report until
// CF-68 wires one; the server `.strict()`-400s a body carrying dailyStreak.

import { useCallback, useRef } from 'react';
import type { PlayerSaveWriteRequest } from '@packbreaker/shared';
import { useApiFetch } from '../api/useApiFetch';
import { putPlayerSave } from '../api/playerSave';
import { useAccountLinked, useSyncHydrated } from '../auth/AccountLinkContext';

/** One completed round — the producer's report to the push seam. Mirrors the
 *  Delta DTO minus the daily field (which this hook hardcodes to null, R9). */
export type RoundResultReport = Pick<
  PlayerSaveWriteRequest,
  'runId' | 'round' | 'roundOutcome'
>;

export function usePlayerSavePush(): (result: RoundResultReport) => Promise<boolean> {
  const apiFetch = useApiFetch();
  const linked = useAccountLinked();
  const hydrated = useSyncHydrated();
  // Ref so the stable callback reads the LIVE gate values — no stale closure,
  // and no effect re-fire from a changing callback identity.
  const gateRef = useRef({ linked, hydrated });
  gateRef.current = { linked, hydrated };

  return useCallback(
    async (result: RoundResultReport): Promise<boolean> => {
      // signed-in + linked AND the initial pull has settled (pull-before-push
      // serialization, Codex round 1 P1). A gate-closed push is not attempted;
      // the caller's queue HOLDS while !hydrated, so returning false here only
      // happens in a sign-out-mid-drain race — the queue treats it as a failed
      // attempt (bounded-retry-then-drop), which is correct for a signed-out
      // session (server-wins on the next sign-in reconciles).
      if (!gateRef.current.linked || !gateRef.current.hydrated) return false;
      // Delta trust-model: send runId / round / roundOutcome ONLY — the server
      // computes the trophy delta. lastDailyAttempted is the deliberate CF-76
      // null (R9); dailyStreak is never client-settable. Returns true on 2xx.
      return putPlayerSave(apiFetch, {
        runId: result.runId,
        round: result.round,
        roundOutcome: result.roundOutcome,
        lastDailyAttempted: null,
      });
    },
    [apiFetch],
  );
}
