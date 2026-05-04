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

  it('combat_done (win) advances round + grants reward + appends history', () => {
    const initial = freshInitial();
    const inCombat: ClientRunState = { ...initial, combatActive: true };
    const next = clientRunReducer(inCombat, {
      type: 'combat_done',
      result: STUB_COMBAT_RESULT,
      opponentGhostId: null,
      damageDealt: 30,
      damageTaken: 6,
    });
    expect(next.combatActive).toBe(false);
    expect(next.state.round).toBe(initial.state.round + 1);
    expect(next.state.gold).toBe(initial.state.gold + 1);
    expect(next.state.trophy).toBe(initial.state.trophy + 18);
    expect(next.state.hearts).toBe(initial.state.hearts);
    expect(next.state.rerollCount).toBe(0);
    expect(next.state.history).toHaveLength(1);
    expect(next.state.history[0]).toMatchObject({
      round: initial.state.round,
      outcome: 'win',
      damageDealt: 30,
      damageTaken: 6,
      goldEarnedThisRound: 1,
      opponentGhostId: null,
    });
  });

  it('combat_done (loss) decrements hearts + grants no reward', () => {
    const initial = freshInitial();
    const inCombat: ClientRunState = { ...initial, combatActive: true };
    const lossResult = { ...STUB_COMBAT_RESULT, outcome: 'ghost_win' as const };
    const next = clientRunReducer(inCombat, {
      type: 'combat_done',
      result: lossResult,
      opponentGhostId: null,
      damageDealt: 12,
      damageTaken: 30,
    });
    expect(next.combatActive).toBe(false);
    expect(next.state.round).toBe(initial.state.round + 1);
    expect(next.state.gold).toBe(initial.state.gold);
    expect(next.state.trophy).toBe(initial.state.trophy);
    expect(next.state.hearts).toBe(initial.state.hearts - 1);
    expect(next.state.history).toHaveLength(1);
    expect(next.state.history[0]).toMatchObject({
      outcome: 'loss',
      goldEarnedThisRound: 0,
      damageTaken: 30,
    });
  });

  it('combat_done (loss at 0 hearts) clamps hearts at zero', () => {
    const initial = freshInitial();
    const inCombat: ClientRunState = {
      ...initial,
      combatActive: true,
      state: { ...initial.state, hearts: 0 },
    };
    const lossResult = { ...STUB_COMBAT_RESULT, outcome: 'ghost_win' as const };
    const next = clientRunReducer(inCombat, {
      type: 'combat_done',
      result: lossResult,
      opponentGhostId: null,
      damageDealt: 0,
      damageTaken: 30,
    });
    expect(next.state.hearts).toBe(0);
  });
});
