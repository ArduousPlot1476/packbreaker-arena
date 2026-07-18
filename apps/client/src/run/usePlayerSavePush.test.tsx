// usePlayerSavePush (M2.1 CF-77 Phase 2 PR2) — the per-round Delta PUT callback:
// gated on linked && hydrated, sends {runId, round, roundOutcome,
// lastDailyAttempted:null} and NO trophy value. Recovered + adapted from the
// CF-75 suite (git history) now the push is live again (decision-log.md
// 2026-07-18 § "CF-77 Phase 2 PR2 — PHASE 1 RATIFIED", R7/R9).

import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RoundResultReport } from './usePlayerSavePush';

const { useAccountLinkedMock, useSyncHydratedMock, fetchSpy } = vi.hoisted(() => ({
  useAccountLinkedMock: vi.fn(),
  useSyncHydratedMock: vi.fn(),
  fetchSpy: vi.fn(),
}));
vi.mock('../auth/AccountLinkContext', () => ({
  useAccountLinked: () => useAccountLinkedMock(),
  useSyncHydrated: () => useSyncHydratedMock(),
}));
vi.mock('../api/useApiFetch', () => ({ useApiFetch: () => fetchSpy }));

import { usePlayerSavePush } from './usePlayerSavePush';

function report(round: number): RoundResultReport {
  return { runId: 'run-uuid-1', round, roundOutcome: 'win' };
}

beforeEach(() => {
  fetchSpy.mockReset();
  fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
  useAccountLinkedMock.mockReset();
  useSyncHydratedMock.mockReset();
  useSyncHydratedMock.mockReturnValue(true); // pull already settled by default
});

describe('usePlayerSavePush', () => {
  it('PUTs {runId, round, roundOutcome, lastDailyAttempted:null} when linked + hydrated', async () => {
    useAccountLinkedMock.mockReturnValue(true);
    const { result } = renderHook(() => usePlayerSavePush());

    const delivered = await result.current(report(3));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/v1/player/save');
    expect(init.method).toBe('PUT');
    // Delta body: NO trophy value on the wire; lastDailyAttempted the CF-76 null.
    expect(JSON.parse(init.body as string)).toEqual({
      runId: 'run-uuid-1',
      round: 3,
      roundOutcome: 'win',
      lastDailyAttempted: null,
    });
    expect(delivered).toBe(true);
  });

  it('does NOT PUT when unlinked (signed-out / anonymous)', async () => {
    useAccountLinkedMock.mockReturnValue(false);
    const { result } = renderHook(() => usePlayerSavePush());

    const delivered = await result.current(report(3));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(delivered).toBe(false);
  });

  it('does NOT PUT when linked but the initial pull has not settled (hydrated=false)', async () => {
    useAccountLinkedMock.mockReturnValue(true);
    useSyncHydratedMock.mockReturnValue(false); // pull-before-push serialization
    const { result } = renderHook(() => usePlayerSavePush());

    const delivered = await result.current(report(3));

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(delivered).toBe(false);
  });
});
