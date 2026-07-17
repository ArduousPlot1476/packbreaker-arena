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
}

const AccountLinkContext = createContext<AccountLinkState>({
  linked: false,
  setLinked: () => {},
  hydrated: false,
  setHydrated: () => {},
});

export function AccountLinkProvider({ children }: { children: ReactNode }) {
  const [linked, setLinked] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const value = useMemo<AccountLinkState>(
    () => ({ linked, setLinked, hydrated, setHydrated }),
    [linked, hydrated],
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
