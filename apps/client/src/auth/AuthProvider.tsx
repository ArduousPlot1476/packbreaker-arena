// Auth provider (M2.1 PR2).
//
// Wraps the app root. When a Clerk publishable key is configured, renders
// ClerkProvider and bridges Clerk's getToken into AuthTokenContext. When
// unset (local/CI, or no-account deployments), renders children directly —
// NO ClerkProvider, so nothing throws and every request stays anonymous
// (concept-brief no-forced-login pillar). Clerk hooks/components mount only
// on the enabled path.
//
// Package note (M2.1 PR2): uses `@clerk/react` (Clerk's supported React
// SDK, Core 3). The originally-named `@clerk/clerk-react` is deprecated in
// favour of this package; SignInButton/UserButton (the task-named
// components) are unchanged, so the substitution is transparent here.

import { ClerkProvider, useAuth } from '@clerk/react';
import { useCallback, type ReactNode } from 'react';
import { AccountLinkOnSignIn } from './AccountLinkOnSignIn';
import { AuthTokenContext, type GetSessionToken } from './authToken';
import { CLERK_PUBLISHABLE_KEY } from './config';

function ClerkTokenBridge({ children }: { children: ReactNode }) {
  const { getToken } = useAuth();
  // Clerk's getToken() resolves to the session JWT, or null when signed
  // out — exactly the GetSessionToken contract.
  const value = useCallback<GetSessionToken>(() => getToken(), [getToken]);
  return (
    <AuthTokenContext.Provider value={value}>
      {children}
    </AuthTokenContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (CLERK_PUBLISHABLE_KEY === undefined) {
    // Anonymous-only: no Clerk. Consumers get the default AuthTokenContext
    // (returns null), so the fetch layer sends no Authorization header.
    return <>{children}</>;
  }
  return (
    <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY}>
      <ClerkTokenBridge>
        <AccountLinkOnSignIn />
        {children}
      </ClerkTokenBridge>
    </ClerkProvider>
  );
}
