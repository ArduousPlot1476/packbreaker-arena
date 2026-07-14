// postAccountLink — response-gated bounded retry (M2.1 PR2 meta-audit).

import { describe, expect, it, vi } from 'vitest';
import { postAccountLink } from './postAccountLink';

const noSleep = async () => {};

function response(status: number): Response {
  return new Response(status === 204 ? null : JSON.stringify({}), { status });
}

describe('postAccountLink', () => {
  it('returns true on a 2xx (single POST, correct body)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(200));
    const linked = await postAccountLink(fetchFn, 'anon-1', { sleep: noSleep });
    expect(linked).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/account/link');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ anonId: 'anon-1' });
  });

  it('does NOT retry a 400 (single POST → false)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(400));
    const linked = await postAccountLink(fetchFn, 'anon-1', { sleep: noSleep });
    expect(linked).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503, then succeeds on the retry', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200));
    const linked = await postAccountLink(fetchFn, 'anon-1', {
      sleep: noSleep,
      maxAttempts: 3,
    });
    expect(linked).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('retries a persistent 401 up to the bound, then gives up (false)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(response(401));
    const linked = await postAccountLink(fetchFn, 'anon-1', {
      sleep: noSleep,
      maxAttempts: 3,
    });
    expect(linked).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('retries a network error up to the bound, then gives up', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    const linked = await postAccountLink(fetchFn, 'anon-1', {
      sleep: noSleep,
      maxAttempts: 2,
    });
    expect(linked).toBe(false);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
