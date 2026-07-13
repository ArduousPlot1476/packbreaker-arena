// Account-link effect (M2.1 PR2.5).
//
// Renders nothing. On each signed-out→signed-in transition it POSTs the
// device telemetryAnonId to /v1/account/link (through useApiFetch, so the
// Clerk session token rides along as the Authorization header). The server
// creates-or-links idempotently, so this client-side once-per-transition
// guard is only a courtesy — a failed call is swallowed and simply retried
// on a later sign-in. Mounted only on the Clerk-enabled path (AuthProvider),
// so anonymous builds never run it.

import { useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { useApiFetch } from '../api/useApiFetch';
import { loadLocal } from '../persistence';

export function AccountLinkOnSignIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const apiFetch = useApiFetch();
  const linkedThisSession = useRef(false);

  useEffect(() => {
    // Reset on sign-out so a later sign-in re-links (server is idempotent).
    if (!isSignedIn) {
      linkedThisSession.current = false;
      return;
    }
    if (!isLoaded || linkedThisSession.current) return;

    // The anonId is eagerly persisted at app startup (ensureAnonIdPersisted),
    // so it is normally present here. Guard anyway: if it is not yet
    // available, do NOT mark the session linked — retry on the next change
    // rather than consuming the transition (Codex round 1 P1).
    const anonId = loadLocal()?.telemetryAnonId;
    if (anonId === undefined) return;

    linkedThisSession.current = true;
    // Best-effort: sign-in must never break on a link failure (server is
    // idempotent). Errors are swallowed; a later sign-in retries.
    void apiFetch('/v1/account/link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ anonId }),
    }).catch(() => undefined);
  }, [isLoaded, isSignedIn, apiFetch]);

  return null;
}
