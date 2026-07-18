// Ordered delivery (M2.1 CF-77 Phase 2 PR2, R5). RunProvider's session-scoped
// queue drains per-round pushes IN ORDER (each awaits the prior ack), and on a
// failing push retries AT MOST TWICE then DROPS the head and advances — no
// stall, no unbounded backlog. decision-log.md 2026-07-18 § "CF-77 Phase 2 PR2
// — PHASE 1 RATIFIED".

import { useEffect } from 'react';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClassId, RelicId } from '@packbreaker/content';

const { putSpy, getSpy } = vi.hoisted(() => ({
  putSpy: vi.fn(),
  getSpy: vi.fn(),
}));
vi.mock('../api/playerSave', () => ({
  getPlayerSave: (...a: unknown[]) => getSpy(...a),
  putPlayerSave: (...a: unknown[]) => putSpy(...a),
}));
// Auto-fire beginRun on mount so RunProvider boots a run without class-select.
vi.mock('../screens/ClassSelectScreen', () => ({
  ClassSelectScreen: function StubClassSelectScreen({
    onConfirm,
  }: {
    onConfirm: (i: { classId: ClassId; startingRelicId: RelicId }) => void;
  }) {
    useEffect(() => {
      onConfirm({ classId: 'tinker' as ClassId, startingRelicId: 'apprentices-loop' as RelicId });
    }, [onConfirm]);
    return null;
  },
}));

import {
  AccountLinkProvider,
  useSetAccountLinked,
  useSetSyncHydrated,
} from '../auth/AccountLinkContext';
import { RunProvider, useRunContext } from './RunContext';
import type { CombatDonePayload } from './useRun';

const WIN: CombatDonePayload = {
  result: { events: [], outcome: 'player_win', finalHp: { player: 30, ghost: 0 }, endedAtTick: 5 },
  opponentGhostId: null,
  opponentClassId: 'marauder' as ClassId,
  damageDealt: 30,
  damageTaken: 0,
};

let latest: ReturnType<typeof useRunContext> | null = null;
function Capture() {
  latest = useRunContext();
  return null;
}
function GateOpener() {
  const setLinked = useSetAccountLinked();
  const setHydrated = useSetSyncHydrated();
  useEffect(() => {
    setLinked(true);
    setHydrated(true);
  }, [setLinked, setHydrated]);
  return null;
}
async function renderRun() {
  latest = null;
  render(
    <AccountLinkProvider>
      <GateOpener />
      <RunProvider>
        <Capture />
      </RunProvider>
    </AccountLinkProvider>,
  );
  await waitFor(() => {
    expect(latest).not.toBeNull();
    expect(latest!.simRun).not.toBeNull();
  });
}
async function resolveWin() {
  act(() => latest!.onContinue());
  await waitFor(() => expect(latest!.state.combatActive).toBe(true));
  act(() => latest!.onCombatDone(WIN));
  await waitFor(() => expect(latest!.state.combatActive).toBe(false));
}
const roundsPushed = () => putSpy.mock.calls.map((c) => (c[1] as { round: number }).round);

beforeEach(() => {
  localStorage.clear();
  putSpy.mockReset();
  getSpy.mockReset();
  getSpy.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('RunProvider — ordered delivery queue (R5)', () => {
  it('delivers per-round pushes IN ROUND ORDER', async () => {
    putSpy.mockResolvedValue(true);
    await renderRun();

    await resolveWin(); // round 1
    await resolveWin(); // round 2
    await resolveWin(); // round 3

    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(3));
    expect(roundsPushed()).toEqual([1, 2, 3]);
  });

  it('a failing push retries at most twice, then DROPS the head and advances (no stall)', async () => {
    // Round 2 always fails (false); rounds 1 and 3 succeed. The queue must retry
    // round 2 exactly twice, drop it, and still deliver round 3 — proving no
    // head-of-line stall and a bounded (max-2) attempt budget.
    putSpy.mockImplementation((_apiFetch: unknown, body: { round: number }) =>
      Promise.resolve(body.round !== 2),
    );
    await renderRun();

    await resolveWin(); // round 1 (ok)
    await resolveWin(); // round 2 (fails, retried then dropped)
    await resolveWin(); // round 3 (ok)

    // 1 (ok) + 2 (fail ×2) + 3 (ok) = 4 attempts, in order.
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(4));
    expect(roundsPushed()).toEqual([1, 2, 2, 3]);
  });

  it("SERIALIZES: round N+1's PUT does not BEGIN until round N settles", async () => {
    // Falsifiability (Rule 28): the [1,2,3] / [1,2,2,3] cases above assert the
    // resulting ORDER, but an implementation that fired all pushes concurrently
    // and merely resolved them in order would satisfy them too. This case
    // isolates the actual R5 requirement — each round's PUT awaits the prior
    // ack — by holding round 1's push PENDING and proving round 2's PUT has NOT
    // begun. A concurrent drain fails HERE (round 2 fires immediately), which is
    // what makes this test worth having; proven by the break-and-revert at
    // commit 7 (decision-log CF-77 PR2 close).
    let resolveRound1!: (delivered: boolean) => void;
    putSpy.mockImplementation((_apiFetch: unknown, body: { round: number }) => {
      if (body.round === 1) {
        return new Promise<boolean>((resolve) => {
          resolveRound1 = resolve;
        });
      }
      return Promise.resolve(true);
    });
    await renderRun();

    await resolveWin(); // round 1 → its PUT fires and HANGS (pending)
    await resolveWin(); // round 2 → enqueued BEHIND the unresolved round 1

    // Round 1's PUT is in flight; round 2's PUT must not have begun — the queue
    // is blocked on round 1's ack, not firing round 2 concurrently.
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));
    expect(roundsPushed()).toEqual([1]);

    // Settle round 1 → the queue advances and round 2's PUT fires, in order.
    await act(async () => {
      resolveRound1(true);
    });
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(2));
    expect(roundsPushed()).toEqual([1, 2]);
  });
});
