// Optional sign-in affordance (M2.1 PR2).
//
// Stopgap entry point in the class-select chrome — NOT a new Title/Settings
// screen (that's a deferred refined-art deliverable, its own CF). Renders
// nothing when Clerk is unconfigured, so anonymous builds are visually
// unchanged. Signed out → a "Sign in" button (Clerk modal, no routing/redirect
// setup needed); signed in → Clerk's prebuilt UserButton. Sign-in is always
// optional and never gates play.
//
// Core 3 note: `@clerk/react` removed <SignedIn>/<SignedOut>; we toggle on
// useAuth().isSignedIn instead (the task-named SignInButton/UserButton are
// unchanged).

import { SignInButton, UserButton, useAuth } from '@clerk/react';
import { clerkEnabled } from './config';

export function SignInAffordance() {
  // Guard BEFORE any Clerk hook so this is safe to render outside a
  // ClerkProvider (anonymous builds / tests).
  if (!clerkEnabled) return null;
  return <SignInAffordanceInner />;
}

function SignInAffordanceInner() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return null; // avoid a signed-out flash during Clerk load
  if (isSignedIn) {
    return <UserButton />;
  }
  return (
    <SignInButton mode="modal">
      <button
        type="button"
        style={{
          font: 'inherit',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--text-secondary)',
          background: 'transparent',
          border: '1px solid var(--border, rgba(255,255,255,0.16))',
          borderRadius: 8,
          padding: '6px 14px',
          cursor: 'pointer',
        }}
      >
        Sign in
      </button>
    </SignInButton>
  );
}
