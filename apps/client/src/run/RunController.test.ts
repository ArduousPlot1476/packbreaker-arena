// Reducer correctness tests for the run-screen state machine. Verifies
// each RunAction transitions ClientRunState as expected, including the
// drag_cancel cleanup path that @dnd-kit's onDragCancel /
// PointerSensor pointercancel + window-blur handling routes through.

import { describe, expect, it } from 'vitest';
import type {
  ClassId,
  CombatResult,
  ContractId,
  IsoTimestamp,
  RelicId,
  RoundNumber,
  RunId,
  RunOutcome,
  RunState as SimRunState,
  SerializedRunState,
  SimSeed,
} from '@packbreaker/content';
import { DEFAULT_RULESET } from '@packbreaker/content';
import {
  clientRunReducer,
  createInitialState,
  INITIAL_CLIENT_STATE,
  type ClientRunState,
} from './RunController';
import type { BagItem, ItemId } from './types';

const TINKER = 'tinker' as ClassId;

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
  return createInitialState(TINKER);
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

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 1 Implementation F.1 + F.2 — applySimSnapshot regression
// tests for CF 39 (maxHearts under iron-will) + Finding A (className).
//
// Both fields used to be client-owned-derived placeholders hardcoded to
// the Tinker M1_PROTOTYPE_CLASS world. Under class-select reachability,
// they have to track sim-authoritative state per applySimSnapshot.
// ────────────────────────────────────────────────────────────────────

describe('clientRunReducer — applySimSnapshot CF 39 + Finding A regressions', () => {
  it('F.1 CF 39: Marauder + iron-will init_from_sim → maxHearts=4 AND hearts=4', () => {
    // Iron Will gives +1 heart (RELICS['iron-will'].modifiers.bonusHearts).
    // sim's composeRuleset adds the bonus to DEFAULT_RULESET.startingHearts=3
    // → effectiveRuleset.startingHearts=4 (also the initial hearts value at
    // run start). Pre-fix: client's INITIAL_CLIENT_STATE.maxHearts=3
    // (DEFAULT_RULESET.startingHearts), so the resolution panel showed 4/3
    // post-Iron-Will. Post-fix: applySimSnapshot writes
    // snapshot.ruleset.startingHearts into maxHearts on every init/sync.
    const simRulesetWithIronWill = {
      ...DEFAULT_RULESET,
      startingHearts: 4, // hearts=3 base + 1 from iron-will
    };
    const snapshot: SimRunState = {
      runId: 'test-marauder-iron-will' as RunId,
      seed: 12345 as SimSeed,
      classId: 'marauder' as ClassId,
      contractId: 'neutral' as ContractId,
      ruleset: simRulesetWithIronWill,
      derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
      startedAt: '2025-01-01T00:00:00.000Z' as IsoTimestamp,
      hearts: 4,
      gold: 4,
      currentRound: 1 as RoundNumber,
      bag: { dimensions: { width: 6, height: 4 }, placements: [] },
      relics: { starter: 'iron-will' as RelicId, mid: null, boss: null },
      shop: { slots: [], purchased: [], rerollsThisRound: 0 },
      trophiesAtStart: 0,
      history: [],
      outcome: 'in_progress',
    };
    const next = clientRunReducer(freshInitial(), {
      type: 'init_from_sim',
      snapshot,
    });
    expect(next.state.hearts).toBe(4);
    expect(next.state.maxHearts).toBe(4);
  });

  it('reset_run from a terminal won state returns INITIAL_CLIENT_STATE singleton', () => {
    // Construct a "terminal" state: outcome flipped + history populated +
    // hearts depleted (Marauder Iron Will victory shape with depleted hearts
    // mid-boss). reset_run should discard ALL of this and return the module
    // initial state. Reference equality with INITIAL_CLIENT_STATE proves the
    // reducer returns the singleton (not a structurally-equivalent copy),
    // which is what the resetRun hook callback relies on for two-axis reset
    // semantics in Step 2.
    const terminal: ClientRunState = {
      ...freshInitial(),
      state: {
        ...freshInitial().state,
        outcome: 'won' as RunOutcome,
        round: 11 as RoundNumber,
        hearts: 1,
        history: [
          { round: 11 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 0, goldEarnedThisRound: 4, opponentGhostId: null, opponentClassId: null },
        ],
      },
    };
    const next = clientRunReducer(terminal, { type: 'reset_run' });
    expect(next).toBe(INITIAL_CLIENT_STATE);
  });

  it('reset_run is idempotent — reducer returns the same singleton across repeated dispatches', () => {
    const after1 = clientRunReducer(freshInitial(), { type: 'reset_run' });
    const after2 = clientRunReducer(after1, { type: 'reset_run' });
    expect(after2).toBe(after1);
    expect(after2).toBe(INITIAL_CLIENT_STATE);
  });

  it('F.2 Finding A: Marauder init_from_sim → className === "Marauder"', () => {
    // Pre-fix: className was hardcoded to 'Tinker' at createInitialState
    // and never overwritten by applySimSnapshot, so a Marauder run still
    // reported 'Tinker' for any consumer reading state.state.className
    // (combat overlay portrait label, etc.).  Post-fix: applySimSnapshot
    // writes CLASSES[snapshot.classId].displayName into className.
    const snapshot: SimRunState = {
      runId: 'test-marauder-class-label' as RunId,
      seed: 12345 as SimSeed,
      classId: 'marauder' as ClassId,
      contractId: 'neutral' as ContractId,
      ruleset: DEFAULT_RULESET,
      derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
      startedAt: '2025-01-01T00:00:00.000Z' as IsoTimestamp,
      hearts: 3,
      gold: 4,
      currentRound: 1 as RoundNumber,
      bag: { dimensions: { width: 6, height: 4 }, placements: [] },
      relics: { starter: 'razors-edge' as RelicId, mid: null, boss: null },
      shop: { slots: [], purchased: [], rerollsThisRound: 0 },
      trophiesAtStart: 0,
      history: [],
      outcome: 'in_progress',
    };
    const next = clientRunReducer(freshInitial(), {
      type: 'init_from_sim',
      snapshot,
    });
    expect(next.state.className).toBe('Marauder');
    expect(next.state.classId).toBe('marauder');
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3a Commit 6 — restore_from_save reducer arm.
//
// Mirrors the init_from_sim shape but also pulls SerializedRunState-only
// fields (rerollCount, trophy) onto ClientRunState and inverse-impedance-
// bridges snapshot.bag.placements (sim shape) back to BagItem[] (client
// shape).
// ────────────────────────────────────────────────────────────────────

function makeSerializedSnapshot(
  overrides: Partial<SerializedRunState> = {},
): SerializedRunState {
  return {
    runId: 'restore-test-run' as RunId,
    seed: 12345 as SimSeed,
    classId: 'marauder' as ClassId,
    contractId: 'neutral' as ContractId,
    ruleset: { ...DEFAULT_RULESET, startingHearts: 4 },
    derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 2 },
    startedAt: '2026-05-20T10:00:00.000Z' as IsoTimestamp,
    hearts: 3,
    gold: 42,
    currentRound: 6 as RoundNumber,
    bag: {
      dimensions: { width: 6, height: 4 },
      placements: [
        { placementId: 'p-0' as ClassId, itemId: 'iron-sword' as ItemId, anchor: { col: 0, row: 0 }, rotation: 0 },
        { placementId: 'p-1' as ClassId, itemId: 'wooden-shield' as ItemId, anchor: { col: 2, row: 1 }, rotation: 90 },
      ] as unknown as SimRunState['bag']['placements'],
    },
    relics: {
      starter: 'iron-will' as RelicId,
      mid: 'berserkers-pendant' as RelicId,
      boss: null,
    },
    shop: {
      slots: ['copper-coin', 'leather-strap', 'iron-sword'] as unknown as SimRunState['shop']['slots'],
      purchased: [],
      rerollsThisRound: 0,
    },
    trophiesAtStart: 0,
    history: [
      { round: 1 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
      { round: 2 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 8, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
      { round: 3 as RoundNumber, outcome: 'loss', damageDealt: 12, damageTaken: 30, goldEarnedThisRound: 0, opponentGhostId: null, opponentClassId: null },
      { round: 4 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 6, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
      { round: 5 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
    ],
    outcome: 'in_progress' as RunOutcome,
    rngState: 0xdeadbeef,
    rerollCount: 2,
    trophy: 72,
    ...overrides,
  };
}

/** Derives a sim RunState from a SerializedRunState — equivalent to
 *  what `restoreRun(snapshot).getState()` would return when the
 *  recomposed ruleset/derived happen to match the persisted ones
 *  (i.e. same-version, no registry drift). Used by the existing
 *  restore_from_save reducer tests where the cross-version concern
 *  isn't under test; the Catch 26 invariant test below DOES pass
 *  diverging values to prove the reducer reads sim-authoritative
 *  fields from controllerSnapshot. */
function controllerSnapshotFrom(s: SerializedRunState): SimRunState {
  return {
    runId: s.runId,
    seed: s.seed,
    classId: s.classId,
    contractId: s.contractId,
    ruleset: s.ruleset,
    derived: s.derived,
    startedAt: s.startedAt,
    hearts: s.hearts,
    gold: s.gold,
    currentRound: s.currentRound,
    bag: s.bag,
    relics: s.relics,
    shop: s.shop,
    trophiesAtStart: s.trophiesAtStart,
    history: s.history,
    outcome: s.outcome,
  };
}

describe('clientRunReducer — restore_from_save (M1.5b PR 3 / 5b.3a)', () => {
  it('writes sim-authoritative fields from the serialized snapshot', () => {
    const snapshot = makeSerializedSnapshot();
    const next = clientRunReducer(freshInitial(), {
      type: 'restore_from_save',
      snapshot,
      controllerSnapshot: controllerSnapshotFrom(snapshot),
    });
    expect(next.state.hearts).toBe(3);
    expect(next.state.round).toBe(6);
    expect(next.state.classId).toBe('marauder');
    expect(next.state.className).toBe('Marauder');
    expect(next.state.maxHearts).toBe(4); // ruleset.startingHearts=4 (iron-will)
    expect(next.state.relics.starter).toBe('iron-will');
    expect(next.state.relics.mid).toBe('berserkers-pendant');
    expect(next.state.outcome).toBe('in_progress');
    expect(next.state.history).toHaveLength(5);
    expect(next.state.history[2]!.outcome).toBe('loss');
  });

  it('lifts SerializedRunState-only fields (rerollCount, trophy, gold) onto state', () => {
    const snapshot = makeSerializedSnapshot();
    const next = clientRunReducer(freshInitial(), {
      type: 'restore_from_save',
      snapshot,
      controllerSnapshot: controllerSnapshotFrom(snapshot),
    });
    expect(next.state.gold).toBe(42); // includeGold=true on init/restore
    expect(next.state.rerollCount).toBe(2); // SerializedRunState extension
    expect(next.state.trophy).toBe(72); // SerializedRunState extension
  });

  it('inverse-impedance-bridges snapshot.bag.placements back to BagItem[] (uid/col/row/rot)', () => {
    const snapshot = makeSerializedSnapshot();
    const next = clientRunReducer(freshInitial(), {
      type: 'restore_from_save',
      snapshot,
      controllerSnapshot: controllerSnapshotFrom(snapshot),
    });
    expect(next.bag).toHaveLength(2);
    expect(next.bag[0]).toEqual({
      uid: 'p-0',
      itemId: 'iron-sword',
      col: 0,
      row: 0,
      rot: 0,
    });
    expect(next.bag[1]).toEqual({
      uid: 'p-1',
      itemId: 'wooden-shield',
      col: 2,
      row: 1,
      rot: 90,
    });
  });

  it('bootstraps top-level shop from snapshot.shop.slots (mirrors init_from_sim shape)', () => {
    const snapshot = makeSerializedSnapshot();
    const next = clientRunReducer(freshInitial(), {
      type: 'restore_from_save',
      snapshot,
      controllerSnapshot: controllerSnapshotFrom(snapshot),
    });
    expect(next.shop).toHaveLength(3);
    expect(next.shop[0]!.itemId).toBe('copper-coin');
    expect(next.shop[1]!.itemId).toBe('leather-strap');
    expect(next.shop[2]!.itemId).toBe('iron-sword');
    // UID convention: s{currentRound}-{rerollsThisRound}-{i}
    expect(next.shop[0]!.uid).toBe('s6-0-0');
    expect(next.shop[1]!.uid).toBe('s6-0-1');
    expect(next.shop[2]!.uid).toBe('s6-0-2');
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3a Phase 2.5j-fix (Catch 26) — cross-version restore
// hydration invariant.
//
// Pre-fix, the restore_from_save reducer arm dispatched only the raw
// persisted snapshot and applySimSnapshot assigned ruleset/derived
// directly from snapshot.* (the persisted-time composition). When the
// current registries (or composeRuleset logic) differ from when the
// save was written, the persisted ruleset/derived are stale; sim's
// restoreRun recomposes them via composeRuleset; client.state.ruleset
// would carry the stale persisted values while simRun used the
// recomposed ones — reroll cost / shop generation diverge.
//
// Post-fix, the reducer reads sim-authoritative fields from
// action.controllerSnapshot (post-restoreRun, recomposed); client-
// authoritative fields stay sourced from action.snapshot. This test
// pins the INVARIANT — sim-authoritative == controllerSnapshot AND
// client-owned == snapshot — by intentionally diverging the two
// inputs. Pattern 7 discipline: don't assert a round-trip proxy.
// ────────────────────────────────────────────────────────────────────

describe('clientRunReducer — cross-version restore hydration (Phase 2.5j-fix / Catch 26)', () => {
  it('reads ruleset/derived/maxHearts from controllerSnapshot, NOT snapshot, when they diverge', () => {
    // Snapshot carries STALE values (as if persisted from an older app
    // version). controllerSnapshot carries CURRENT recomposed values.
    // The reducer must pull sim-authoritative fields from controller.
    const snapshot = makeSerializedSnapshot({
      ruleset: { ...DEFAULT_RULESET, startingHearts: 3, rerollCostStart: 99 },
      derived: { extraRerollsPerRound: 99, itemCostDelta: 99, bonusGoldOnWin: 99 },
    });
    const controllerSnapshot = controllerSnapshotFrom(snapshot);
    // Diverge controller's ruleset/derived from snapshot's (simulating
    // restoreRun's composeRuleset producing different values).
    const divergedController: SimRunState = {
      ...controllerSnapshot,
      ruleset: { ...DEFAULT_RULESET, startingHearts: 5, rerollCostStart: 7 },
      derived: { extraRerollsPerRound: 2, itemCostDelta: -1, bonusGoldOnWin: 4 },
    };

    const next = clientRunReducer(freshInitial(), {
      type: 'restore_from_save',
      snapshot,
      controllerSnapshot: divergedController,
    });

    // Sim-authoritative — pulled from controllerSnapshot (recomposed):
    expect(next.state.ruleset.startingHearts).toBe(5); // NOT 3 (snapshot stale)
    expect(next.state.ruleset.rerollCostStart).toBe(7); // NOT 99
    expect(next.state.maxHearts).toBe(5); // derives from controller.ruleset.startingHearts
    expect(next.state.derived.extraRerollsPerRound).toBe(2); // NOT 99
    expect(next.state.derived.itemCostDelta).toBe(-1);
    expect(next.state.derived.bonusGoldOnWin).toBe(4);
  });

  it('client-authoritative fields (bag, shop, rerollCount, trophy) still come from snapshot', () => {
    const snapshot = makeSerializedSnapshot();
    // Diverge controllerSnapshot's bag/shop/etc. — reducer must IGNORE
    // these and pull from snapshot for client-owned fields.
    const divergedController: SimRunState = {
      ...controllerSnapshotFrom(snapshot),
      bag: { dimensions: { width: 6, height: 4 }, placements: [] }, // sim restoreRun forces empty
      shop: { slots: [], purchased: [], rerollsThisRound: 0 }, // mismatches snapshot
    };

    const next = clientRunReducer(freshInitial(), {
      type: 'restore_from_save',
      snapshot,
      controllerSnapshot: divergedController,
    });

    // Bag: from snapshot.bag.placements (controller's empty array
    // would render 0 items; snapshot has 2).
    expect(next.bag).toHaveLength(2);
    expect(next.bag[0]!.itemId).toBe('iron-sword');
    // Shop: from snapshot.shop.slots (controller's empty would be 0).
    expect(next.shop).toHaveLength(3);
    expect(next.shop[0]!.itemId).toBe('copper-coin');
    // SerializedRunState-only fields:
    expect(next.state.rerollCount).toBe(2); // snapshot.rerollCount
    expect(next.state.trophy).toBe(72); // snapshot.trophy
  });
});
