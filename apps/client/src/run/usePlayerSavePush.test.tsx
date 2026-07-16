// usePlayerSavePush (M2.1 CF-75) — the PUT callback: linked-gated, sends the
// pass-through trophies + hardcoded lastDailyAttempted: null (CF-76 bounded).

import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalSaveV1 } from '@packbreaker/shared';

const { useAccountLinkedMock, fetchSpy } = vi.hoisted(() => ({
  useAccountLinkedMock: vi.fn(),
  fetchSpy: vi.fn(),
}));
vi.mock('../auth/AccountLinkContext', () => ({
  useAccountLinked: () => useAccountLinkedMock(),
}));
vi.mock('../api/useApiFetch', () => ({ useApiFetch: () => fetchSpy }));

import { usePlayerSavePush } from './usePlayerSavePush';

function save(trophies: number): LocalSaveV1 {
  return {
    schemaVersion: 1,
    trophies,
    dailyStreak: 4,
    lastDailyAttempted: null,
    tutorialCompleted: false,
    telemetryAnonId: 'anon',
    inProgressRun: null,
  };
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
  useAccountLinkedMock.mockReset();
});

describe('usePlayerSavePush', () => {
  it('PUTs pass-through trophies + hardcoded lastDailyAttempted:null when linked', async () => {
    useAccountLinkedMock.mockReturnValue(true);
    const { result } = renderHook(() => usePlayerSavePush());

    result.current(save(15));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/player/save');
    expect(init.method).toBe('PUT');
    // trophies is the real envelope value (15), NOT a hardcoded 0;
    // lastDailyAttempted is the deliberate CF-76 null.
    expect(JSON.parse(init.body as string)).toEqual({
      trophies: 15,
      lastDailyAttempted: null,
    });
  });

  it('does NOT PUT when unlinked (signed-out / anonymous)', async () => {
    useAccountLinkedMock.mockReturnValue(false);
    const { result } = renderHook(() => usePlayerSavePush());

    result.current(save(15));

    // Give any stray async a tick; assert nothing fired.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
