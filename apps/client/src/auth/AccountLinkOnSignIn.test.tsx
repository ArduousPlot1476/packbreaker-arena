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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAuthMock.mockReset();
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
});
