// Shared account-link state (M2.1 CF-75).
//
// AccountLinkOnSignIn establishes the link (idempotent POST /v1/account/link)
// and, until now, tracked "linked" in a component-local ref. CF-75's player-
// save sync needs that signal in TWO other places — the GET-on-sign-in pull
// (PlayerSaveSyncOnSignIn) and the PUT-on-quiescent-save push (RunProvider) —
// so it is lifted here. Both the pull and the push are gated on `linked`
// (signed-in + account-linked) per the Phase 1 ratification
// (decision-log.md 2026-07-16 § "CF-75 + CF-76 Phase 1 RATIFIED").
//
// Default value is `linked: false` with a no-op setter, so consumers on the
// anonymous path (no Clerk, no AccountLinkProvider mounted) read false and
// their sync no-ops — no provider required for the anonymous build.

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface AccountLinkState {
  readonly linked: boolean;
  readonly setLinked: (linked: boolean) => void;
  /** True once this linked session's INITIAL pull (GET /v1/player/save) has
   *  settled — see `hydrated` below. */
  readonly hydrated: boolean;
  readonly setHydrated: (hydrated: boolean) => void;
  /** CF-77 Phase 2 PR2 (Codex round-1 P2): AFFIRMATIVE signed-out — Clerk has
   *  loaded AND the user is not signed in (`isLoaded && !isSignedIn`). A truly
   *  anonymous session, distinct from the INDETERMINATE states (Clerk not loaded
   *  yet, or signed-in-but-link-pending) where this stays false. The round-push
   *  queue drops ONLY on this and holds on every indeterminate state — dropping
   *  is irreversible, holding is recoverable. Published by AccountLinkOnSignIn. */
  readonly signedOut: boolean;
  readonly setSignedOut: (signedOut: boolean) => void;
}

const AccountLinkContext = createContext<AccountLinkState>({
  linked: false,
  setLinked: () => {},
  hydrated: false,
  setHydrated: () => {},
  // Anonymous build (no AccountLinkProvider mounted): there is no Clerk at all,
  // so the session is affirmatively anonymous → true (the queue drops). The
  // PROVIDER's initial value below is false instead — a mounted-but-unresolved
  // Clerk session is INDETERMINATE and must hold, not drop.
  signedOut: true,
  setSignedOut: () => {},
});

export function AccountLinkProvider({ children }: { children: ReactNode }) {
  const [linked, setLinked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  // Starts false = indeterminate (Clerk not yet loaded on this path → HOLD);
  // AccountLinkOnSignIn publishes the real `isLoaded && !isSignedIn` once Clerk
  // resolves. NOT the context default (true) — see the default's comment.
  const [signedOut, setSignedOut] = useState(false);
  const value = useMemo<AccountLinkState>(
    () => ({ linked, setLinked, hydrated, setHydrated, signedOut, setSignedOut }),
    [linked, hydrated, signedOut],
  );
  return (
    <AccountLinkContext.Provider value={value}>
      {children}
    </AccountLinkContext.Provider>
  );
}

/** True once the signed-in session's account is linked (a genuine 2xx from
 *  POST /v1/account/link this session); false when signed out or anonymous. */
export function useAccountLinked(): boolean {
  return useContext(AccountLinkContext).linked;
}

/** Setter for AccountLinkOnSignIn to publish the linked transition. */
export function useSetAccountLinked(): (linked: boolean) => void {
  return useContext(AccountLinkContext).setLinked;
}

/** True once this linked session's INITIAL server pull has settled (success OR
 *  failure). The PUT push gates on this so a quiescent-save push can never race
 *  ahead of the initial pull and be clobbered by an in-flight GET's stale read
 *  (Codex round 1 P1 — currently dormant since all synced values are 0/null,
 *  but live the moment a trophy producer lands). Set by PlayerSaveSyncOnSignIn;
 *  reset to false on unlink so a re-link re-serializes pull-before-push. */
export function useSyncHydrated(): boolean {
  return useContext(AccountLinkContext).hydrated;
}

/** Setter for PlayerSaveSyncOnSignIn to publish "the initial pull has settled." */
export function useSetSyncHydrated(): (hydrated: boolean) => void {
  return useContext(AccountLinkContext).setHydrated;
}

/** True iff Clerk has loaded AND the user is affirmatively signed out — a truly
 *  anonymous session. False for every indeterminate state (Clerk not loaded, or
 *  signed-in-but-link-pending). The round-push queue drops only on this. */
export function useSignedOut(): boolean {
  return useContext(AccountLinkContext).signedOut;
}

/** Setter for AccountLinkOnSignIn to publish `isLoaded && !isSignedIn`. */
export function useSetSignedOut(): (signedOut: boolean) => void {
  return useContext(AccountLinkContext).setSignedOut;
}
