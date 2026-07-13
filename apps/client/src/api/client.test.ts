// § 6.4 apiFetch wrapper — Authorization header logic (M2.1 PR2).
//
// Proves item 4's contract at the wrapper level (no live authed endpoint
// exists yet): token present → Bearer header; token null/absent → no header
// (anonymous requests unchanged).

import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './client';

function stubFetch() {
  const spy = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function headersOf(spy: ReturnType<typeof vi.fn>): Headers {
  const init = spy.mock.calls[0]?.[1] as RequestInit | undefined;
  return new Headers(init?.headers);
}

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches Authorization: Bearer when a token is present', async () => {
    const spy = stubFetch();
    await apiFetch('/v1/run/save', { method: 'POST' }, { token: 'jwt-123' });
    expect(headersOf(spy).get('Authorization')).toBe('Bearer jwt-123');
  });

  it('omits Authorization when the token is null (anonymous)', async () => {
    const spy = stubFetch();
    await apiFetch('/v1/run/save', { method: 'POST' }, { token: null });
    expect(headersOf(spy).has('Authorization')).toBe(false);
  });

  it('omits Authorization when no options are given', async () => {
    const spy = stubFetch();
    await apiFetch('/v1/contract/daily');
    expect(headersOf(spy).has('Authorization')).toBe(false);
  });

  it('preserves caller-supplied headers alongside the Bearer token', async () => {
    const spy = stubFetch();
    await apiFetch(
      '/v1/run/save',
      { headers: { 'Content-Type': 'application/json' } },
      { token: 'jwt-123' },
    );
    const headers = headersOf(spy);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer jwt-123');
  });
});
