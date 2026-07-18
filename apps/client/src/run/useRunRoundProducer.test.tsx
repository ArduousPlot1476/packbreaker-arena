// useRun — per-round PUSH producer (M2.1 CF-77 Phase 2 PR2; renamed from
// useRunQuiescentPush.test.tsx). The old premise — "onRoundResult fires on the
// initial quiescent save" — is INVALIDATED by R1: the producer is keyed on
// state.state.history.length, so it fires once per RESOLVED round (never on the
// round-1 arranging-entry, where history is still empty). Also covers R10 (the
// terminal round pushes) and R4 (restore refire reuses the SAME persisted
// runId). decision-log.md 2026-07-18 § "CF-77 Phase 2 PR2 — PHASE 1 RATIFIED".

import { StrictMode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassId, RelicId } from '@packbreaker/content';
import { useRun, type CombatDonePayload } from './useRun';
import { loadLocal } from '../persistence';

const WIN: CombatDonePayload = {
  result: { events: [], outcome: 'player_win', finalHp: { player: 30, ghost: 0 }, endedAtTick: 5 },
  opponentGhostId: null,
  opponentClassId: 'marauder' as ClassId,
  damageDealt: 30,
  damageTaken: 0,
};
const LOSS: CombatDonePayload = {
  result: { events: [], outcome: 'ghost_win', finalHp: { player: 0, ghost: 12 }, endedAtTick: 3 },
  opponentGhostId: null,
  opponentClassId: 'marauder' as ClassId,
  damageDealt: 10,
  damageTaken: 30,
};

type Rendered = { current: ReturnType<typeof useRun> };

function begin(result: Rendered) {
  act(() => {
    result.current.beginRun({
      classId: 'tinker' as ClassId,
      startingRelicId: 'apprentices-loop' as RelicId,
    });
  });
}

async function resolveRound(result: Rendered, outcome: CombatDonePayload) {
  act(() => result.current.onContinue());
  await waitFor(() => expect(result.current.state.combatActive).toBe(true));
  act(() => result.current.onCombatDone(outcome));
  await waitFor(() => expect(result.current.state.combatActive).toBe(false));
}

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe('useRun — per-round push producer (onRoundResult)', () => {
  it('does NOT fire on the initial arranging-entry (no resolved round yet)', async () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useRun({ onRoundResult: spy }));
    begin(result);
    await waitFor(() => expect(result.current.simRun).not.toBeNull());
    // The round-1 arranging-entry saved locally, but history is still empty, so
    // the producer must not push — the CF-75 "fires on the initial save" premise
    // is dead (R1: [round, outcome] would false-fire here; history.length=0).
    expect(spy).not.toHaveBeenCalled();
  });

  it('fires exactly once per resolved round with {runId, round, roundOutcome}', async () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useRun({ onRoundResult: spy }));
    begin(result);
    await waitFor(() => expect(result.current.simRun).not.toBeNull());

    await resolveRound(result, WIN);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const call1 = spy.mock.calls[0]![0];
    expect(call1.round).toBe(1);
    expect(call1.roundOutcome).toBe('win');
    expect(typeof call1.runId).toBe('string');
    expect(call1.runId.length).toBeGreaterThan(0);

    await resolveRound(result, WIN);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy.mock.calls[1]![0].round).toBe(2);
    // Same run → same runId across rounds (minted once, not re-minted).
    expect(spy.mock.calls[1]![0].runId).toBe(call1.runId);
  });

  it('R10: fires for the TERMINAL round (history appends before the outcome flip)', async () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useRun({ onRoundResult: spy }));
    begin(result);
    await waitFor(() => expect(result.current.simRun).not.toBeNull());

    // 3 losses exhaust the 3 starting hearts → round 3 is terminal (eliminated).
    await resolveRound(result, LOSS);
    await resolveRound(result, LOSS);
    await resolveRound(result, LOSS);

    // The run ended...
    expect(result.current.state.state.outcome).not.toBe('in_progress');
    // ...AND the producer fired for the run-deciding terminal round. Without the
    // terminal history append + the history.length producer, that round would
    // never reach the server (the quiescent-save effect early-returns + clears).
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(3));
    expect(spy.mock.calls[2]![0].round).toBe(3);
    expect(spy.mock.calls[2]![0].roundOutcome).toBe('loss');
  });

  it('R4: restore refire pushes the last restored round under the SAME persisted runId', async () => {
    // Session 1: play two rounds so the composer persists inProgressRun with the
    // run's pushRunId + a 2-entry history (still in_progress).
    const spy1 = vi.fn();
    const first = renderHook(() => useRun({ onRoundResult: spy1 }));
    begin(first.result);
    await waitFor(() => expect(first.result.current.simRun).not.toBeNull());
    await resolveRound(first.result, WIN);
    await resolveRound(first.result, WIN);

    const persisted = loadLocal();
    const persistedRunId = persisted?.inProgressRun?.pushRunId;
    expect(typeof persistedRunId).toBe('string');
    expect(persisted?.inProgressRun?.outcome).toBe('in_progress');
    // The live run pushed round 2 under exactly this id.
    expect(spy1.mock.calls.at(-1)![0].runId).toBe(persistedRunId);
    first.unmount();

    // Session 2: a fresh useRun restores from that save. history.length jumps
    // 0 → 2, the producer refires for the LAST restored round (round 2) under
    // the SAME persisted runId — read through, NOT re-minted — so the server PK
    // absorbs it (or it repairs a lost pre-crash push).
    const spy2 = vi.fn();
    const second = renderHook(() => useRun({ onRoundResult: spy2 }));
    await waitFor(() => expect(second.result.current.simRun).not.toBeNull());
    await waitFor(() => expect(spy2).toHaveBeenCalled());
    const refire = spy2.mock.calls.at(-1)![0];
    expect(refire.round).toBe(2);
    expect(refire.runId).toBe(persistedRunId);
  });

  it('StrictMode: a run pushes under a single stable runId (no split-brain on the dev double-mount)', async () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useRun({ onRoundResult: spy }), {
      wrapper: StrictMode,
    });
    begin(result);
    await waitFor(() => expect(result.current.simRun).not.toBeNull());
    await resolveRound(result, WIN);
    await resolveRound(result, WIN);
    await waitFor(() => expect(spy).toHaveBeenCalled());

    const runIds = new Set(spy.mock.calls.map((c) => c[0].runId as string));
    expect(runIds.size).toBe(1);
    expect(loadLocal()?.inProgressRun?.pushRunId).toBe([...runIds][0]);
  });
});
