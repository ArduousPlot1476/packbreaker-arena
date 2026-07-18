// Player-save caller (M2.1 CF-75; PUT body reshaped to the Delta model in
// CF-77 Phase 2 PR1) — GET/PUT mechanics, never-throws contract.
//
// putPlayerSave's MECHANICS are unchanged by CF-77 (URL, method, JSON headers,
// 2xx→true / else→false, never throws); only the request BODY shape changed, so
// these tests just send a valid Delta body. The GET tests are untouched — the
// response DTO is unchanged.

import { describe, expect, it, vi } from 'vitest';
import type { PlayerSaveWriteRequest } from '@packbreaker/shared';
import { getPlayerSave, putPlayerSave } from './playerSave';

function res(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
  });
}

/** A valid Delta-model write body (CF-77 Phase 2). The specific values are
 *  irrelevant to putPlayerSave's mechanics — it only needs a well-typed body. */
const WRITE_BODY: PlayerSaveWriteRequest = {
  runId: 'run-test',
  round: 1,
  roundOutcome: 'win',
  lastDailyAttempted: null,
};

describe('getPlayerSave', () => {
  it('GETs /v1/player/save and returns the parsed save on 200', async () => {
    const save = { trophies: 12, dailyStreak: 3, lastDailyAttempted: '2026-07-16' };
    const fetchFn = vi.fn().mockResolvedValue(res(200, save));
    const result = await getPlayerSave(fetchFn);
    expect(result).toEqual(save);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/player/save');
    expect(init.method).toBe('GET');
  });

  it('accepts a null lastDailyAttempted (the PR3 zero-state)', async () => {
    const save = { trophies: 0, dailyStreak: 0, lastDailyAttempted: null };
    const fetchFn = vi.fn().mockResolvedValue(res(200, save));
    expect(await getPlayerSave(fetchFn)).toEqual(save);
  });

  it('returns null on 404 account_not_linked (nothing to hydrate)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(404, { error: 'account_not_linked' }));
    expect(await getPlayerSave(fetchFn)).toBeNull();
  });

  it('returns null on 401 and 503', async () => {
    for (const status of [401, 503]) {
      const fetchFn = vi.fn().mockResolvedValue(res(status, { error: 'x' }));
      expect(await getPlayerSave(fetchFn)).toBeNull();
    }
  });

  it('returns null on a network error (never throws)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await getPlayerSave(fetchFn)).toBeNull();
  });

  it('returns null on a malformed 200 body rather than hydrating garbage', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(res(200, { trophies: 'NaN', dailyStreak: 1, lastDailyAttempted: null }));
    expect(await getPlayerSave(fetchFn)).toBeNull();
  });
});

describe('putPlayerSave', () => {
  it('PUTs /v1/player/save with a JSON body and returns true on 2xx', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(200, {}));
    const ok = await putPlayerSave(fetchFn, WRITE_BODY);
    expect(ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/player/save');
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual(WRITE_BODY);
  });

  it('returns false on 400 / 401 / 503 (no throw)', async () => {
    for (const status of [400, 401, 503]) {
      const fetchFn = vi.fn().mockResolvedValue(res(status, { error: 'x' }));
      expect(await putPlayerSave(fetchFn, WRITE_BODY)).toBe(false);
    }
  });

  it('returns false on a network error (never throws)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));
    expect(await putPlayerSave(fetchFn, WRITE_BODY)).toBe(false);
  });
});
