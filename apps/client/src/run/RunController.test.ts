// Reducer correctness tests for the run-screen state machine. Verifies
// each RunAction transitions ClientRunState as expected, including the
// drag_cancel cleanup path that @dnd-kit's onDragCancel /
// PointerSensor pointercancel + window-blur handling routes through.

import { describe, expect, it } from 'vitest';
import {
  clientRunReducer,
  INITIAL_CLIENT_STATE,
  type ClientRunState,
} from './RunController';
import type { BagItem } from '../data.local';

const sampleBagItem: BagItem = {
  uid: 'b1',
  itemId: 'iron-sword',
  col: 1,
  row: 0,
  rot: 0,
};

function withDrag(state: ClientRunState): ClientRunState {
  return {
    ...state,
    drag: { itemId: 'iron-sword', rot: 0, fromBagUid: 'b1' },
  };
}

describe('clientRunReducer', () => {
  it('starts a bag pickup, recording drag.fromBagUid', () => {
    const next = clientRunReducer(INITIAL_CLIENT_STATE, {
      type: 'pickup_bag',
      uid: sampleBagItem.uid,
      itemId: sampleBagItem.itemId,
      rot: sampleBagItem.rot,
    });
    expect(next.drag).toEqual({
      itemId: 'iron-sword',
      rot: 0,
      fromBagUid: 'b1',
    });
  });

  it('refuses pickup_bag while combat is active', () => {
    const combatActive: ClientRunState = { ...INITIAL_CLIENT_STATE, combatActive: true };
    const next = clientRunReducer(combatActive, {
      type: 'pickup_bag',
      uid: 'b1',
      itemId: 'iron-sword',
      rot: 0,
    });
    expect(next.drag).toBeNull();
  });

  it('rotates the drag — adds 90° per dispatch', () => {
    let state = withDrag(INITIAL_CLIENT_STATE);
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
      ...INITIAL_CLIENT_STATE,
      drag: { itemId: 'iron-sword', rot: 0, fromBagUid: 'b1' },
      hover: { col: 3, row: 2 },
    };
    const next = clientRunReducer(dragging, { type: 'drag_cancel' });
    expect(next.drag).toBeNull();
    expect(next.hover).toBeNull();
  });

  it('drop_bag on a valid empty cell moves a bag item', () => {
    const dragging: ClientRunState = {
      ...INITIAL_CLIENT_STATE,
      drag: { itemId: 'iron-sword', rot: 0, fromBagUid: 'b1' },
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
    const dragging: ClientRunState = {
      ...INITIAL_CLIENT_STATE,
      drag: { itemId: 'iron-sword', rot: 0, fromBagUid: 'b1' },
    };
    const goldBefore = dragging.state.gold;
    const sword = dragging.bag.find((b) => b.uid === 'b1');
    expect(sword).toBeDefined();
    const next = clientRunReducer(dragging, { type: 'sell_drop' });
    expect(next.bag.find((b) => b.uid === 'b1')).toBeUndefined();
    expect(next.state.gold).toBe(goldBefore + Math.floor(3 * 0.5)); // iron-sword cost = 3
  });

  it('reroll deducts cost and increments rerollCount', () => {
    // INITIAL has rerollCount = 0, gold = 8. First reroll costs 1.
    const next = clientRunReducer(INITIAL_CLIENT_STATE, {
      type: 'reroll',
      uidPrefix: 'sX',
    });
    expect(next.state.rerollCount).toBe(1);
    expect(next.state.gold).toBe(INITIAL_CLIENT_STATE.state.gold - 1);
    expect(next.shop).toHaveLength(INITIAL_CLIENT_STATE.shop.length);
  });

  it('continue_to_combat sets combatActive only when not already in combat', () => {
    const next = clientRunReducer(INITIAL_CLIENT_STATE, { type: 'continue_to_combat' });
    expect(next.combatActive).toBe(true);
    const noOp = clientRunReducer(next, { type: 'continue_to_combat' });
    expect(noOp).toBe(next); // identity-equal: no state change
  });

  it('combat_done advances round + grants reward + resets rerollCount', () => {
    const inCombat: ClientRunState = { ...INITIAL_CLIENT_STATE, combatActive: true };
    const next = clientRunReducer(inCombat, { type: 'combat_done' });
    expect(next.combatActive).toBe(false);
    expect(next.state.round).toBe(INITIAL_CLIENT_STATE.state.round + 1);
    expect(next.state.gold).toBe(INITIAL_CLIENT_STATE.state.gold + 1);
    expect(next.state.trophy).toBe(INITIAL_CLIENT_STATE.state.trophy + 18);
    expect(next.state.rerollCount).toBe(0);
  });
});
