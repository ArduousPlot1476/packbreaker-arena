// AccountLinkOnSignIn — fires /v1/account/link once per sign-in transition
// (M2.1 PR2.5). Clerk's useAuth and the persistence loadLocal are mocked so
// the transition logic is exercised with no ClerkProvider / real save.

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }));
vi.mock('@clerk/react', () => ({ useAuth: () => useAuthMock() }));
vi.mock('../persistence', () => ({
  loadLocal: () => ({ telemetryAnonId: 'anon-uuid-xyz' }),
}));

import { AccountLinkOnSignIn } from './AccountLinkOnSignIn';
import { AccountLinkProvider, useSignedOut } from './AccountLinkContext';

// CF-77 Phase 2 PR2 (Codex round-1 P2): probe the AFFIRMATIVE-signed-out signal
// the round-push queue reads. The queue only ever sees the derived `signedOut`,
// so the tri-state derivation (isLoaded/isSignedIn → signedOut) can only be
// tested where useAuth lives — here, not at the queue level.
let observedSignedOut: boolean | null = null;
function SignedOutProbe() {
  observedSignedOut = useSignedOut();
  return null;
}
// A FRESH element per call — a constant element would make rerender() a no-op
// (React bails on an identical element reference, so the effect never re-runs
// with the new useAuth() value).
const signalTree = () => (
  <AccountLinkProvider>
    <AccountLinkOnSignIn />
    <SignedOutProbe />
  </AccountLinkProvider>
);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAuthMock.mockReset();
  observedSignedOut = null;
});

function stubFetch() {
  const spy = vi
    .fn()
    .mockResolvedValue(
      new Response(JSON.stringify({ accountId: 'a', linked: true }), {
        status: 200,
      }),
    );
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('AccountLinkOnSignIn', () => {
  it('does not call the link endpoint while signed out', () => {
    const spy = stubFetch();
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    render(<AccountLinkOnSignIn />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('POSTs /v1/account/link once on the false→true transition', async () => {
    const spy = stubFetch();
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const { rerender } = render(<AccountLinkOnSignIn />);
    expect(spy).not.toHaveBeenCalled();

    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    rerender(<AccountLinkOnSignIn />);

    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/account/link');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ anonId: 'anon-uuid-xyz' });
  });

  it('does not consume the session on a 4xx — a later sign-in retries', async () => {
    const spy = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'x' }), { status: 400 }),
      );
    vi.stubGlobal('fetch', spy);
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    const { rerender } = render(<AccountLinkOnSignIn />);

    // First sign-in → attempt 1 (400 is NOT retried by postAccountLink).
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    rerender(<AccountLinkOnSignIn />);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

    // Sign out then back in: the 400 did NOT mark the session linked, so a
    // fresh attempt fires on the next transition.
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    rerender(<AccountLinkOnSignIn />);
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    rerender(<AccountLinkOnSignIn />);
    await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
  });

  it('(b) publishes signedOut=false while Clerk is NOT loaded (indeterminate → HOLD); true only when loaded + signed out', async () => {
    stubFetch();
    // Clerk not loaded yet — isSignedIn is undefined. The queue must HOLD here;
    // a naive `!isSignedIn` derivation would flip signedOut TRUE (undefined is
    // falsy) and re-introduce the reported pre-load drop.
    useAuthMock.mockReturnValue({ isLoaded: false, isSignedIn: undefined });
    const { rerender } = render(signalTree());
    await vi.waitFor(() => expect(observedSignedOut).toBe(false));

    // Signed in, link POST in flight → still indeterminate → HOLD.
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: true });
    rerender(signalTree());
    await vi.waitFor(() => expect(observedSignedOut).toBe(false));

    // Loaded AND signed out → AFFIRMATIVE signed-out → the queue DROPs on this.
    useAuthMock.mockReturnValue({ isLoaded: true, isSignedIn: false });
    rerender(signalTree());
    await vi.waitFor(() => expect(observedSignedOut).toBe(true));
  });
});
