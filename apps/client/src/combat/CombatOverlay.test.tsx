// Regression test for the M1.3.4b step-4 halt-gate fix (option 2 —
// zero-content fast-skip). When sim returns a draw with no damage
// either side (player empty bag + passive ghost item, sparse stalemate
// at MAX_COMBAT_TICKS), CombatOverlay must short-circuit the Phaser
// mount and jump straight to RoundResolution. The reducer + telemetry
// path is unchanged: combat_done still dispatches via handleNext on
// the user's NEXT click.
//
// The Phaser scene module (./CombatScene) is mocked so the test bundle
// never touches Phaser — the zero-content branch should never instantiate
// the game in the first place, and the mock makes that observable.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CombatResult } from '@packbreaker/content';
import { CombatOverlay } from './CombatOverlay';
import { RunProvider } from '../run/RunContext';

// Zero-content draw result fixture — matches the failed M1.3.4b
// halt-gate scenario (round-1 empty bag + passive ghost item).
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
// happy-dom (it isn't well-supported there). The zero-content branch
// shouldn't call createCombatGame — the mock asserts that.
vi.mock('./CombatScene', () => ({
  createCombatGame: mocks.createCombatGame,
  CombatScene: { KEY: 'MockedCombatScene' },
}));

describe('CombatOverlay — zero-content fast-skip (M1.3.4b step 4)', () => {
  it('skips Phaser mount and renders RoundResolution directly when draw + 0/0 damage', () => {
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
});
