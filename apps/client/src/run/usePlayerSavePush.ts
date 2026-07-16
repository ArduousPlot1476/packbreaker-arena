// Player-save PUSH callback (M2.1 CF-75).
//
// Returns the `onQuiescentSave` callback RunProvider injects into useRun. The
// PUT rides useRun's EXACT quiescent-save trigger (fires right after each
// local saveLocal), so the cloud push cadence matches local persistence with
// no separate effect and no new trigger surface. Gated on signed-in + linked.
//
// Stable identity (useCallback over [apiFetch]) + a linked ref means useRun's
// quiescent effect — which reads this via closure and excludes it from its
// deps — always calls a current callback without a stale-closure gate. Returns
// a no-op-when-unlinked function on the anonymous path (useAccountLinked
// defaults false), so a signed-out session never pushes.

import { useCallback, useRef } from 'react';
import type { LocalSaveV1 } from '@packbreaker/shared';
import { useApiFetch } from '../api/useApiFetch';
import { putPlayerSave } from '../api/playerSave';
import { useAccountLinked } from '../auth/AccountLinkContext';

export function usePlayerSavePush(): (save: LocalSaveV1) => void {
  const apiFetch = useApiFetch();
  const linked = useAccountLinked();
  // Ref so the stable callback reads the live linked value (no stale closure,
  // and no effect re-fire from a changing callback identity).
  const linkedRef = useRef(linked);
  linkedRef.current = linked;

  return useCallback(
    (save: LocalSaveV1) => {
      if (!linkedRef.current) return; // signed-in + linked gate

      // ── CF-76 BOUNDED POSTURE — read before "hardening" this. ──
      // `trophies` is a GENUINE PASS-THROUGH of the local envelope value. It
      // is 0 today only because LocalSaveV1.trophies has no producer yet (a
      // spun-off CF); it is deliberately NOT the literal 0, so this begins
      // persisting real trophies the moment a producer lands.
      //
      // `lastDailyAttempted` is a DELIBERATE hardcoded null. The client has no
      // honest daily attempt to report until CF-68 (daily-contract client-fetch
      // leg) wires one, so it must never assert a date. The server derives
      // dailyStreak from this + the server date and caps exposure at
      // +1/server-day — BOUNDED, NOT cheat-resistant.
      //
      // CF-68 is NECESSARY-BUT-INSUFFICIENT to close this gap: even once the
      // client plays the real daily and can honestly send today's date, true
      // cheat-resistance ALSO requires a SERVER-SIDE participation-evidence
      // mechanism (a verified daily-completion event). Wiring CF-68 alone,
      // without that evidence mechanism, ACTIVATES the gap rather than closing
      // it. See decision-log.md 2026-07-16 § "CF-75 + CF-76 Phase 1 RATIFIED".
      void putPlayerSave(apiFetch, {
        trophies: save.trophies,
        lastDailyAttempted: null,
      });
    },
    [apiFetch],
  );
}
