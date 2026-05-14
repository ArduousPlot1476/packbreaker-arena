// Reducer correctness tests for the run-screen state machine. Verifies
// each RunAction transitions ClientRunState as expected, including the
// drag_cancel cleanup path that @dnd-kit's onDragCancel /
// PointerSensor pointercancel + window-blur handling routes through.

import { describe, expect, it } from 'vitest';
import type { CombatResult } from '@packbreaker/content';
import {
  clientRunReducer,
  createInitialState,
  type ClientRunState,
} from './RunController';
import type { BagItem, ItemId } from './types';

// Stub CombatResult — the reducer's combat_done handler doesn't read
// outcome / damage in M1.3.4a commit 2 (commit 3 wires the consumption).
// The minimal shape satisfies the action type so the reducer test can
// drive the round-advance branch.
const STUB_COMBAT_RESULT: CombatResult = {
  events: [],
  outcome: 'player_win',
  finalHp: { player: 30, ghost: 0 },
  endedAtTick: 0,
};

const SWORD = 'iron-sword' as ItemId;

const sampleBagItem: BagItem = {
  uid: 'b1',
  itemId: SWORD,
  col: 1,
  row: 0,
  rot: 0,
};

function withDrag(state: ClientRunState): ClientRunState {
  return {
    ...state,
    drag: { itemId: SWORD, rot: 0, fromBagUid: 'b1' },
  };
}

/** Each test mints its own initial state to keep state isolated when run
 *  in parallel (vitest concurrent mode) — the wall-clock-derived seed
 *  inside createInitialState changes each call but the structural shape
 *  is invariant, which is what these reducer tests assert. */
function freshInitial(): ClientRunState {
  return createInitialState();
}

describe('clientRunReducer', () => {
  it('starts a bag pickup, recording drag.fromBagUid', () => {
    const next = clientRunReducer(freshInitial(), {
      type: 'pickup_bag',
      uid: sampleBagItem.uid,
      itemId: sampleBagItem.itemId,
      rot: sampleBagItem.rot,
    });
    expect(next.drag).toEqual({
      itemId: SWORD,
      rot: 0,
      fromBagUid: 'b1',
    });
  });

  it('refuses pickup_bag while combat is active', () => {
    const combatActive: ClientRunState = { ...freshInitial(), combatActive: true };
    const next = clientRunReducer(combatActive, {
      type: 'pickup_bag',
      uid: 'b1',
      itemId: SWORD,
      rot: 0,
    });
    expect(next.drag).toBeNull();
  });

  it('rotates the drag — adds 90° per dispatch', () => {
    let state = withDrag(freshInitial());
    state = clientRunReducer(state, { type: 'drag_rotate' });
    expect(state.drag?.rot).toBe(90);
    state = clientRunReducer(state, { type: 'drag_rotate' });
    expect(state.drag?.rot).toBe(180);
    state = clientRunReducer(state, { type: 'drag_rotate' });
    state = clientRunReducer(state, { type: 'drag_rotate' });
    expect(state.drag?.rot).toBe(0); // wraps at 360
  });

  it('drag_cancel clears drag + hover (the pointercancel/blur cleanup path)', () => {
    const dragging: ClientRunState = {
      ...freshInitial(),
      drag: { itemId: SWORD, rot: 0, fromBagUid: 'b1' },
      hover: { col: 3, row: 2 },
    };
    const next = clientRunReducer(dragging, { type: 'drag_cancel' });
    expect(next.drag).toBeNull();
    expect(next.hover).toBeNull();
  });

  it('drop_bag on a valid empty cell moves a bag item', () => {
    const initial = freshInitial();
    const dragging: ClientRunState = {
      ...initial,
      bag: [{ ...sampleBagItem }],
      drag: { itemId: SWORD, rot: 0, fromBagUid: 'b1' },
    };
    const next = clientRunReducer(dragging, {
      type: 'drop_bag',
      col: 2,
      row: 2,
      newUid: 'new',
    });
    const moved = next.bag.find((b) => b.uid === 'b1');
    expect(moved?.col).toBe(2);
    expect(moved?.row).toBe(2);
    expect(next.drag).toBeNull();
  });

  it('sell_drop refunds 50% of cost (rounded down) and removes the item', () => {
    const initial = freshInitial();
    const dragging: ClientRunState = {
      ...initial,
      bag: [{ ...sampleBagItem }],
      drag: { itemId: SWORD, rot: 0, fromBagUid: 'b1' },
    };
    const goldBefore = dragging.state.gold;
    const next = clientRunReducer(dragging, { type: 'sell_drop' });
    expect(next.bag.find((b) => b.uid === 'b1')).toBeUndefined();
    expect(next.state.gold).toBe(goldBefore + Math.floor(3 * 0.5)); // iron-sword cost = 3
  });

  it('reroll deducts cost and increments rerollCount', () => {
    // Round-1 initial: rerollCount = 0, gold = baseGoldPerRound = 4. First
    // reroll costs rerollCostStart + 0*increment = 1.
    const initial = freshInitial();
    const next = clientRunReducer(initial, { type: 'reroll' });
    expect(next.state.rerollCount).toBe(1);
    expect(next.state.gold).toBe(initial.state.gold - 1);
    expect(next.shop).toHaveLength(initial.shop.length);
  });

  it('continue_to_combat sets combatActive only when not already in combat', () => {
    const initial = freshInitial();
    const next = clientRunReducer(initial, { type: 'continue_to_combat' });
    expect(next.combatActive).toBe(true);
    const noOp = clientRunReducer(next, { type: 'continue_to_combat' });
    expect(noOp).toBe(next); // identity-equal: no state change
  });

  // M1.5a PR 2 Phase 2b-2 active routing cutover: combat_done's reducer
  // contract collapsed. sim-authoritative fields (hearts/history/round/
  // derived/relics/outcome/trophy) flow exclusively via sync_from_sim
  // (dispatched by onCombatDone BEFORE combat_done). The reducer's
  // combat_done now only applies the precomputed goldDelta (β —
  // sim-computed via before/after observation in onCombatDone),
  // resets combatActive + rerollCount, and regenerates next round's
  // shop locally (client-authoritative bag/shop per Q2 Amendment A).
  it('combat_done applies action.goldDelta + resets combatActive (β capture-delta)', () => {
    const initial = freshInitial();
    const inCombat: ClientRunState = { ...initial, combatActive: true };
    const next = clientRunReducer(inCombat, {
      type: 'combat_done',
      result: STUB_COMBAT_RESULT,
      opponentGhostId: null,
      opponentClassId: null,
      damageDealt: 30,
      damageTaken: 6,
      goldDelta: 5, // sim's winBonus + roundIncome captured by handler
    });
    expect(next.combatActive).toBe(false);
    expect(next.state.gold).toBe(initial.state.gold + 5);
    expect(next.state.rerollCount).toBe(0);
    // Hearts/history/round NOT mutated by combat_done (sync_from_sim
    // populates those upstream). Asserting absence proves the reducer's
    // pre-2b-2 arithmetic block is gone.
    expect(next.state.hearts).toBe(initial.state.hearts);
    expect(next.state.history).toHaveLength(0);
    expect(next.state.round).toBe(initial.state.round);
  });

  it('combat_done with goldDelta=0 leaves gold unchanged (loss-no-advance path)', () => {
    const initial = freshInitial();
    const inCombat: ClientRunState = { ...initial, combatActive: true };
    const lossResult = { ...STUB_COMBAT_RESULT, outcome: 'ghost_win' as const };
    const next = clientRunReducer(inCombat, {
      type: 'combat_done',
      result: lossResult,
      opponentGhostId: null,
      opponentClassId: null,
      damageDealt: 12,
      damageTaken: 30,
      goldDelta: 0, // sim's shouldEndRun fired → no advancePhase credit
    });
    expect(next.combatActive).toBe(false);
    expect(next.state.gold).toBe(initial.state.gold);
    expect(next.state.rerollCount).toBe(0);
    // Hearts/history/round still NOT mutated by combat_done — that's
    // sync_from_sim's job in the real handler flow.
    expect(next.state.hearts).toBe(initial.state.hearts);
    expect(next.state.history).toHaveLength(0);
  });

  it('combat_done with goldDelta=3 (loss + advance, base income only) increments gold by exactly 3', () => {
    const initial = freshInitial();
    const inCombat: ClientRunState = { ...initial, combatActive: true };
    const lossResult = { ...STUB_COMBAT_RESULT, outcome: 'ghost_win' as const };
    const next = clientRunReducer(inCombat, {
      type: 'combat_done',
      result: lossResult,
      opponentGhostId: null,
      opponentClassId: null,
      damageDealt: 0,
      damageTaken: 30,
      goldDelta: 3, // sim's advancePhase round income (no win bonus on loss)
    });
    expect(next.state.gold).toBe(initial.state.gold + 3);
    expect(next.combatActive).toBe(false);
  });
});
