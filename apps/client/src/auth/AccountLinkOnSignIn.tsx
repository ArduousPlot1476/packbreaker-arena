// Account-link effect (M2.1 PR2.5; hardened in the PR2 meta-audit).
//
// Renders nothing. On each signed-out→signed-in transition it POSTs the
// device telemetryAnonId to /v1/account/link (through useApiFetch, so the
// Clerk session token rides along as the Authorization header). The server
// creates-or-links idempotently. The session is marked linked ONLY on a
// genuine 2xx (postAccountLink): a transient 401/503 is retried (bounded),
// and any failure leaves the session unlinked so a later sign-in re-attempts
// (Codex round 3). Mounted only on the Clerk-enabled path (AuthProvider), so
// anonymous builds never run it.

import { useAuth } from '@clerk/react';
import { useEffect, useRef } from 'react';
import { useApiFetch } from '../api/useApiFetch';
import { loadLocal } from '../persistence';
import { postAccountLink } from './postAccountLink';

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
    // so it is normally present here. Guard for undefined AND empty so the
    // client honors the server's min(1) contract and never sends a request
    // that is guaranteed to 400; do NOT consume the transition when it is
    // not yet available (Codex round 1 P1).
    const anonId = loadLocal()?.telemetryAnonId;
    if (anonId === undefined || anonId.length === 0) return;

    let cancelled = false;
    // Mark linked ONLY on a genuine 2xx. postAccountLink retries transient
    // 401/503 (bounded) and never retries 400; on any failure the session
    // stays unlinked so a later transition re-attempts (Codex round 3).
    void postAccountLink(apiFetch, anonId).then((linked) => {
      if (!cancelled && linked) {
        linkedThisSession.current = true;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, apiFetch]);

  return null;
}
