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
}

const AccountLinkContext = createContext<AccountLinkState>({
  linked: false,
  setLinked: () => {},
});

export function AccountLinkProvider({ children }: { children: ReactNode }) {
  const [linked, setLinked] = useState(false);
  const value = useMemo<AccountLinkState>(
    () => ({ linked, setLinked }),
    [linked],
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
