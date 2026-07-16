// Player-save PULL on sign-in (M2.1 CF-75).
//
// § 7.2: on sign-in after account-link 2xx (and on signed-in boot), PULL the
// authoritative server save — server wins. Renders nothing. Fires the GET
// ONCE per linked session (a returning user's account is already linked
// server-side, so the boot case is the same 2xx → linked transition). Gated
// on `linked` from AccountLinkContext, so it only fires after the account
// exists server-side (an earlier GET would 404 account_not_linked).
//
// Hydration is server-wins and SILENT: § 7.2 specs a "synced" toast, but no
// toast infrastructure exists and this PR does not build one (Phase 1 Step 0
// ③, decision-log.md 2026-07-16 § "CF-75 + CF-76 Phase 1 RATIFIED"). The GET
// still does the real server-wins overwrite; only the user-visible
// confirmation is deferred to a follow-up.
//
// Scope note (CF-75 plumbing): the server fields are stubbed (0 / null) until
// producers are wired, so hydration is a real write of currently-zero values
// — correct the moment a producer lands. Mounted only on the Clerk-enabled
// path (AuthProvider), so anonymous builds never run it.

import { useEffect, useRef } from 'react';
import { useApiFetch } from '../api/useApiFetch';
import { getPlayerSave } from '../api/playerSave';
import { hydratePlayerSave } from '../persistence';
import { useAccountLinked } from './AccountLinkContext';

export function PlayerSaveSyncOnSignIn() {
  const linked = useAccountLinked();
  const apiFetch = useApiFetch();
  const pulledThisSession = useRef(false);

  useEffect(() => {
    // Reset on unlink (sign-out) so a later sign-in re-pulls.
    if (!linked) {
      pulledThisSession.current = false;
      return;
    }
    if (pulledThisSession.current) return;
    // Mark BEFORE the await so a re-render (deps unchanged) cannot fire a
    // duplicate in-flight GET. A transient failure (null) is not retried this
    // session — acceptable: hydrating stubbed zeros is idempotent and the next
    // session re-pulls.
    pulledThisSession.current = true;

    let cancelled = false;
    void getPlayerSave(apiFetch).then((save) => {
      // null = nothing to hydrate (404/401/503/network/malformed). Only a real
      // 200 body overwrites local — § 7.2 server-wins, silently (no toast, ③).
      if (cancelled || save === null) return;
      hydratePlayerSave(save);
    });
    return () => {
      cancelled = true;
    };
  }, [linked, apiFetch]);

  return null;
}
