// Regression tests for the M1.3.4b option-2 zero-content fast-skip
// predicate (CombatOverlay.tsx).
//
//   Case A — canonical bypass: the original M1.3.4b step-4 halt-gate
//     fixture (round-1 empty bag + passive ghost item, sparse stalemate
//     at MAX_COMBAT_TICKS). Events array contains only combat_start +
//     combat_end. CombatOverlay must short-circuit the Phaser mount
//     and jump straight to RoundResolution.
//
//   Case B — Codex P1 regression: an active combat that nets to zero
//     HP delta on both sides (damage exactly offset by healing) but
//     contains real damage + heal events the player needs to see. The
//     bypass must NOT fire — Phaser must mount and play the events.
//     The pre-Codex-P1 predicate (`damageDealt === 0 && damageTaken
//     === 0 && outcome === 'draw'`) would have falsely matched this
//     fixture; the event-content-based predicate does not.
//
// The Phaser scene module (./CombatScene) is mocked so the test bundle
// never touches Phaser — for Case A the bypass means createCombatGame
// is never called, and the mock makes that observable; for Case B the
// mock just stands in for the real game-construction call.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CombatResult, PlacementId } from '@packbreaker/content';
import { CombatOverlay } from './CombatOverlay';
import { RunProvider } from '../run/RunContext';

// Case A fixture — events = [combat_start, combat_end] only. Matches
// the failed M1.3.4b halt-gate scenario verbatim.
const ZERO_CONTENT_RESULT: CombatResult = {
  events: [
    { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
    {
      tick: 600,
      type: 'combat_end',
      outcome: 'draw',
      finalHp: { player: 30, ghost: 30 },
    },
  ],
  outcome: 'draw',
  finalHp: { player: 30, ghost: 30 },
  endedAtTick: 600,
};

// Case B fixture — outcome === 'draw' + damageDealt === 0 +
// damageTaken === 0 net (Math.max(0, 30 - 30) on both sides) BUT
// events array contains real damage + heal events that net to zero.
// The pre-Codex-P1 predicate would have falsely matched this; the
// event-content-based predicate does not.
const OFFSET_HEAL_RESULT: CombatResult = {
  events: [
    { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
    {
      tick: 50,
      type: 'damage',
      source: { side: 'ghost', placementId: 'g0' as PlacementId },
      target: 'player',
      amount: 5,
      remainingHp: 25,
    },
    {
      tick: 60,
      type: 'damage',
      source: { side: 'player', placementId: 'p0' as PlacementId },
      target: 'ghost',
      amount: 5,
      remainingHp: 25,
    },
    {
      tick: 100,
      type: 'heal',
      source: { side: 'player', placementId: 'p1' as PlacementId },
      target: 'player',
      amount: 5,
      newHp: 30,
    },
    {
      tick: 110,
      type: 'heal',
      source: { side: 'ghost', placementId: 'g1' as PlacementId },
      target: 'ghost',
      amount: 5,
      newHp: 30,
    },
    {
      tick: 600,
      type: 'combat_end',
      outcome: 'draw',
      finalHp: { player: 30, ghost: 30 },
    },
  ],
  outcome: 'draw',
  finalHp: { player: 30, ghost: 30 },
  endedAtTick: 600,
};

// vi.mock factories are hoisted to the top of the module — any
// top-level mock-state references must be created via vi.hoisted so
// the references survive the lift.
const mocks = vi.hoisted(() => ({
  createCombatGame: vi.fn(),
  runCombat: vi.fn(),
}));

vi.mock('./sim-bridge.combat', () => ({
  runCombat: mocks.runCombat,
}));

// Mock the Phaser scene so the test bundle doesn't pull Phaser into
// happy-dom (it isn't well-supported there). For Case A the bypass
// means createCombatGame is never called — the mock asserts that.
// For Case B the mock just stands in for the real game-construction
// call so the Phaser-mount path is observable.
vi.mock('./CombatScene', () => ({
  createCombatGame: mocks.createCombatGame,
  CombatScene: { KEY: 'MockedCombatScene' },
}));

describe('CombatOverlay — zero-content fast-skip predicate (M1.3.4b + Codex P1 amendment)', () => {
  it('Case A — bypasses Phaser mount when events are only combat_start + combat_end (canonical empty stalemate)', () => {
    mocks.runCombat.mockReturnValue(ZERO_CONTENT_RESULT);
    mocks.createCombatGame.mockClear();
    const onDone = vi.fn();

    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={onDone} />
      </RunProvider>,
    );

    // Phaser canvas container is NOT rendered — the option-2 branch
    // initializes phase to 'resolved' on first render.
    expect(screen.queryByTestId('combat-canvas-container')).toBeNull();
    // createCombatGame is never called.
    expect(mocks.createCombatGame).not.toHaveBeenCalled();

    // RoundResolution renders with DEFEAT header and DEALT 0 / TAKEN 0.
    expect(screen.getByText(/DEFEAT/)).toBeInTheDocument();
    expect(screen.getByText(/DEALT/)).toBeInTheDocument();
    expect(screen.getByText(/TAKEN/)).toBeInTheDocument();

    // NEXT click dispatches combat_done with the zero-content payload —
    // reducer + telemetry path stay intact.
    fireEvent.click(screen.getByRole('button', { name: /NEXT ROUND/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    const payload = onDone.mock.calls[0]![0] as {
      damageDealt: number;
      damageTaken: number;
      result: CombatResult;
      opponentGhostId: unknown;
    };
    expect(payload.damageDealt).toBe(0);
    expect(payload.damageTaken).toBe(0);
    expect(payload.result.outcome).toBe('draw');
    expect(payload.result.finalHp).toEqual({ player: 30, ghost: 30 });
  });

  it('Case B — does NOT bypass when events contain damage + heal that net to zero (Codex P1 regression)', async () => {
    mocks.runCombat.mockReturnValue(OFFSET_HEAL_RESULT);
    mocks.createCombatGame.mockClear();
    const onDone = vi.fn();

    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={onDone} />
      </RunProvider>,
    );

    // Phaser canvas container IS rendered — phase initializes to
    // 'combat' because hasNoMeaningfulEvents is false (damage + heal
    // events present), so isZeroContent is false and the bypass does
    // not fire.
    expect(screen.getByTestId('combat-canvas-container')).toBeInTheDocument();
    expect(screen.getByTestId('combat-skip')).toBeInTheDocument();

    // createCombatGame is invoked from useEffect's start() — the call
    // happens after a microtask flush (start is async even when
    // document.fonts is unavailable in happy-dom), so wait for it.
    await waitFor(() => {
      expect(mocks.createCombatGame).toHaveBeenCalled();
    });

    // RoundResolution must NOT be rendered yet — the player has not
    // reached the resolution phase. DEFEAT / VICTORY headers belong
    // to RoundResolution and would only appear after onCombatEnd.
    expect(screen.queryByText(/DEFEAT/)).toBeNull();
    expect(screen.queryByText(/VICTORY/)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});
