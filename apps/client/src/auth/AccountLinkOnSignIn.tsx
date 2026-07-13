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
  const prevSignedIn = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    const was = prevSignedIn.current;
    prevSignedIn.current = isSignedIn;
    if (was || !isSignedIn) return; // only fire on false → true

    const anonId = loadLocal()?.telemetryAnonId;
    if (anonId === undefined) return;

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
