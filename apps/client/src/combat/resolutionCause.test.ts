// CF-93 LEG 1 (B4 + B5) — derived resolution cause + ramp-drain totals.
//
// The load-bearing case is `locks the CF-88 divergence` below: an item kill at
// exactly RAMP_START_TICK is stamped `ramp_ko` by the sim's tick rule while no
// ramp_tick ever fires. The derived cause must read 'items' there. If someone
// later "fixes" this by reading endReason, that test goes RED — which is the
// point. The divergence is CF-88's open scope and must NOT be reconciled here.

import { describe, expect, it } from 'vitest';
import type { CombatEvent, PlacementId } from '@packbreaker/content';
import { computeRampDrain, deriveResolutionCause } from './resolutionCause';

// PlacementId is branded; cast at the fixture boundary exactly as
// attribution.test.ts does. The source side is irrelevant to every assertion
// here — these functions read `type` and `target` only.
const dmg = (tick: number, target: 'player' | 'ghost', amount: number, remainingHp: number): CombatEvent => ({
  tick,
  type: 'damage',
  source: {
    side: target === 'ghost' ? 'player' : 'ghost',
    placementId: 'p1' as PlacementId,
  },
  target,
  amount,
  remainingHp,
});

const ramp = (tick: number, target: 'player' | 'ghost', remainingHp: number): CombatEvent => ({
  tick,
  type: 'ramp_tick',
  target,
  amount: 3,
  remainingHp,
});

describe('deriveResolutionCause', () => {
  it('item kill with no ramp at all → items', () => {
    const events = [dmg(100, 'ghost', 30, 0)];
    expect(deriveResolutionCause(events, 'player_win')).toBe('items');
  });

  it('ramp drains the losing ghost → ramp', () => {
    const events = [ramp(500, 'player', 27), ramp(500, 'ghost', 0)];
    expect(deriveResolutionCause(events, 'player_win')).toBe('ramp');
  });

  it('ramp drains the losing player → ramp', () => {
    const events = [ramp(500, 'player', 0), ramp(500, 'ghost', 12)];
    expect(deriveResolutionCause(events, 'ghost_win')).toBe('ramp');
  });

  it('a draw treats BOTH sides as losing — CF-84 mutual-KO semantics', () => {
    // Only the ghost is drained here; under a player-only reading this would
    // return 'items' and mislabel the very case LEG 1 exists to explain.
    const events = [ramp(509, 'ghost', 0)];
    expect(deriveResolutionCause(events, 'draw')).toBe('ramp');
  });

  it('ramp that touches ONLY the winner does not claim the outcome', () => {
    // Player took drain but survived; the ghost died to an item. The ramp was
    // present in the combat but did not decide it.
    const events = [ramp(500, 'player', 5), dmg(501, 'ghost', 9, 0)];
    expect(deriveResolutionCause(events, 'player_win')).toBe('items');
  });

  it('locks the CF-88 divergence: a tick-500 item kill reads items, NOT ramp', () => {
    // packages/sim stamps endReason 'ramp_ko' here purely because tick >= 500
    // (Marauder iron-mace: 10 procs x 3 = exactly the 30 HP cap, landing on
    // tick 500 with the ramp skipped that tick). No ramp_tick exists, so the
    // DERIVED cause is 'items' and the two surfaces disagree BY DESIGN.
    const events = [dmg(500, 'ghost', 3, 0)];
    expect(deriveResolutionCause(events, 'player_win')).toBe('items');
    expect(events.some((e) => e.type === 'ramp_tick')).toBe(false);
  });

  it('an empty event stream resolves to items rather than throwing', () => {
    expect(deriveResolutionCause([], 'draw')).toBe('items');
  });
});

describe('computeRampDrain', () => {
  it('sums by target and keeps the two sides separate', () => {
    const events = [ramp(500, 'player', 27), ramp(500, 'ghost', 24), ramp(501, 'player', 24)];
    expect(computeRampDrain(events)).toEqual({ player: 6, ghost: 3 });
  });

  it('ignores damage and status events entirely — the ramp is not damage', () => {
    const events = [dmg(10, 'ghost', 12, 18), dmg(20, 'player', 7, 23)];
    expect(computeRampDrain(events)).toEqual({ player: 0, ghost: 0 });
  });

  it('returns zeros for an empty stream', () => {
    expect(computeRampDrain([])).toEqual({ player: 0, ghost: 0 });
  });
});
