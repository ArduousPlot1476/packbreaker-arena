// usePlayerSavePush — PUSH DISABLED in CF-77 Phase 2 PR1.
//
// The CF-75 suite here asserted the linked/hydrated-gated PUT of pass-through
// trophies. PR1 disabled the push (the server DTO moved to the Delta model; the
// body-forming producer lands in PR2), so the hook is now a deliberate no-op.
// This pins THAT contract; PR2 restores the producer and re-instates the full
// linked/hydrated + PUT suite (recover it from this file's CF-75 git history).

import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LocalSaveV1 } from '@packbreaker/shared';
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

describe('usePlayerSavePush (push disabled until CF-77 Phase 2 PR2)', () => {
  it('returns a stable callback that is a no-op (performs no side effect / never throws)', () => {
    const { result, rerender } = renderHook(() => usePlayerSavePush());
    const first = result.current;
    // No network/auth dependencies remain, so invoking it must be inert.
    expect(() => result.current(save(15))).not.toThrow();
    // Stable identity across renders (useCallback []), as RunProvider relies on.
    rerender();
    expect(result.current).toBe(first);
  });
});
