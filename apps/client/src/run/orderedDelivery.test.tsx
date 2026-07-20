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
  useSetSignedOut,
  useSetSyncHydrated,
} from '../auth/AccountLinkContext';
import { RunProvider, useRunContext } from './RunContext';
import type { CombatDonePayload } from './useRun';

const WIN: CombatDonePayload = {
  result: { events: [], outcome: 'player_win', finalHp: { player: 30, ghost: 0 }, endedAtTick: 5, endReason: 'ko' as const },
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
// Captures the three gate setters so a test can set the initial gate state and
// flip it mid-run (linked / hydrated / signedOut are independent axes here).
let gate: {
  setLinked: (v: boolean) => void;
  setHydrated: (v: boolean) => void;
  setSignedOut: (v: boolean) => void;
} | null = null;
function GateProbe() {
  gate = {
    setLinked: useSetAccountLinked(),
    setHydrated: useSetSyncHydrated(),
    setSignedOut: useSetSignedOut(),
  };
  return null;
}
async function renderRun(
  init: { linked: boolean; hydrated: boolean; signedOut: boolean } = {
    linked: true,
    hydrated: true,
    signedOut: false,
  },
) {
  latest = null;
  gate = null;
  render(
    <AccountLinkProvider>
      <GateProbe />
      <RunProvider>
        <Capture />
      </RunProvider>
    </AccountLinkProvider>,
  );
  act(() => {
    gate!.setLinked(init.linked);
    gate!.setHydrated(init.hydrated);
    gate!.setSignedOut(init.signedOut);
  });
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

  // ── Codex round-1 P2: hold pre-link, drop only affirmative signed-out ──
  const tick = (ms = 25) => new Promise((r) => setTimeout(r, ms));

  it('(a) holds a round emitted while signed-in + link pending, then PUTs it once linked+hydrated flip', async () => {
    putSpy.mockResolvedValue(true);
    // Signed in (signedOut=false) but the /v1/account/link POST is still in
    // flight (linked=false) — the exact window the Codex P2 named.
    await renderRun({ linked: false, hydrated: false, signedOut: false });

    await resolveWin(); // round 1 resolves DURING the pre-link window
    await tick();
    // Held, not dropped: the drain gate holds on !linked, so nothing PUT yet.
    expect(putSpy).not.toHaveBeenCalled();

    // Link + initial pull settle → the held round flushes (this is what the
    // a7e3c7a `!linked` enqueue gate would have permanently dropped).
    act(() => {
      gate!.setLinked(true);
      gate!.setHydrated(true);
    });
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));
    expect(roundsPushed()).toEqual([1]);
  });

  it('(c) discards held entries when Clerk resolves to affirmatively signed-out', async () => {
    putSpy.mockResolvedValue(true);
    await renderRun({ linked: false, hydrated: false, signedOut: false });

    await resolveWin(); // round 1 held (pre-link)
    await tick();
    expect(putSpy).not.toHaveBeenCalled();

    // Clerk resolves to affirmatively signed-out → discard the held queue.
    act(() => gate!.setSignedOut(true));
    await tick();

    // A later re-link cannot resurrect the discarded round — the queue is empty.
    act(() => {
      gate!.setSignedOut(false);
      gate!.setLinked(true);
      gate!.setHydrated(true);
    });
    await tick(40);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('(d) drops rounds on an affirmatively signed-out (anonymous) session — never PUTs', async () => {
    putSpy.mockResolvedValue(true);
    await renderRun({ linked: false, hydrated: false, signedOut: true });

    await resolveWin(); // dropped at enqueue (signedOut) — never enters the queue
    await tick(40);
    expect(putSpy).not.toHaveBeenCalled();
  });

  it('identity-guards the shift: a round re-enqueued after a MID-DRAIN discard is not silently dropped', async () => {
    // Round 1's push is held PENDING, so the drain is suspended inside its await
    // with `head` still pointing at round 1. A signed-out event then DISCARDS the
    // queue (queueRef.current.length = 0) mid-await, the user re-signs-in, and a
    // NEW round 2 is enqueued as the fresh head. When round 1 finally resolves,
    // an UNCONDITIONAL shift would remove round 2 (a never-pushed head). The
    // identity-guarded shift removes nothing (head !== queueRef.current[0]), so
    // the loop then delivers round 2.
    let resolveRound1!: (delivered: boolean) => void;
    putSpy.mockImplementation((_apiFetch: unknown, body: { round: number }) => {
      if (body.round === 1) {
        return new Promise<boolean>((resolve) => {
          resolveRound1 = resolve;
        });
      }
      return Promise.resolve(true);
    });
    // Signed in + linked so the queue drains.
    await renderRun({ linked: true, hydrated: true, signedOut: false });

    await resolveWin(); // round 1 → PUT fires and HANGS; drain suspended on the await
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(1));

    // Mid-drain discard: Clerk resolves to signed-out while round 1 is pending.
    act(() => gate!.setSignedOut(true));
    await tick();
    // Re-sign-in, then a NEW round resolves and enqueues as the fresh head.
    act(() => gate!.setSignedOut(false));
    await resolveWin(); // round 2 enqueued behind the still-pending round 1

    // Resolve round 1: its shift must NOT remove round 2 (a different head).
    await act(async () => {
      resolveRound1(true);
    });
    await waitFor(() => expect(putSpy).toHaveBeenCalledTimes(2));
    expect(roundsPushed()).toEqual([1, 2]);
  });
});
