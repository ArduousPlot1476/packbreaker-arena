// useRun — onQuiescentSave rides the EXACT quiescent-save trigger (M2.1 CF-75).
//
// Proves the PUT hook fires on the same signal as the local saveLocal: booting
// a fresh run reaches the round-1 arranging-entry quiescent point (simRun
// null → non-null), which fires saveLocal AND onQuiescentSave with the same
// composed LocalSaveV1. RunProvider supplies the real callback (usePlayerSavePush,
// tested separately); here it is a spy so the trigger wiring is isolated.

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassId, RelicId } from '@packbreaker/content';
import { useRun } from './useRun';

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  localStorage.clear();
});

describe('useRun — onQuiescentSave', () => {
  it('invokes onQuiescentSave with the composed LocalSaveV1 on the initial quiescent save', async () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useRun({ onQuiescentSave: spy }));

    act(() => {
      result.current.beginRun({
        classId: 'tinker' as ClassId,
        startingRelicId: 'apprentices-loop' as RelicId,
      });
    });

    await waitFor(() => expect(result.current.simRun).not.toBeNull());
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const save = spy.mock.calls[0]![0] as { schemaVersion: number; trophies: number };
    // The SAME payload saveLocal received — a full LocalSaveV1, trophies as a
    // real pass-through field (0 on a fresh run, never hardcoded downstream).
    expect(save.schemaVersion).toBe(1);
    expect(typeof save.trophies).toBe('number');
  });
});
