// Reducer correctness tests for the run-screen state machine. Verifies
// each RunAction transitions ClientRunState as expected, including the
// drag_cancel cleanup path that @dnd-kit's onDragCancel /
// PointerSensor pointercancel + window-blur handling routes through.

import { describe, expect, it } from 'vitest';
import type {
  ClassId,
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

  // drop_bag / sell_drop / reroll / combine reducer arms deleted (CF 34 /
  // M1.5e PR 1): those mutations now route through sim actions in useRun
  // (buyItem+placeItem / sellItem / rerollShop+overrideShopSlots /
  // combineRecipe), and the client re-derives bag/shop/gold via sync_from_sim.
  // Their behaviour is covered sim-side (packages/sim run tests) + at the
  // integration layer (RunContext.test.tsx).

  it('continue_to_combat sets combatActive only when not already in combat', () => {
    const initial = freshInitial();
    const next = clientRunReducer(initial, { type: 'continue_to_combat' });
    expect(next.combatActive).toBe(true);
    const noOp = clientRunReducer(next, { type: 'continue_to_combat' });
    expect(noOp).toBe(next); // identity-equal: no state change
  });

  // CF 34 / M1.5e PR 1: combat_done's reducer contract collapsed to a UI
  // concern. Sim owns gold/trophy/rerollCount/shop, and onCombatDone syncs
  // them from sim BEFORE dispatching combat_done — which now only lowers the
  // combat overlay + clears any stray drag (β gold-capture-delta and the
  // client trophy accumulator both retired; combat_done carries no payload).
  it('combat_done clears combatActive + drag and touches no sim-owned state', () => {
    const initial = freshInitial();
    const inCombat: ClientRunState = {
      ...initial,
      combatActive: true,
      drag: { itemId: SWORD, rot: 0, fromBagUid: 'p-0' },
    };
    const goldBefore = inCombat.state.gold;
    const next = clientRunReducer(inCombat, { type: 'combat_done' });
    expect(next.combatActive).toBe(false);
    expect(next.drag).toBeNull();
    // Sim-owned fields are NOT mutated by combat_done — sync_from_sim owns them.
    expect(next.state.gold).toBe(goldBefore);
    expect(next.state.rerollCount).toBe(initial.state.rerollCount);
    expect(next.state.trophy).toBe(initial.state.trophy);
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
      rerollCount: 0,
      trophy: 0,
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
      rerollCount: 0,
      trophy: 0,
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
    rerollCount: s.rerollCount,
    trophy: s.trophy,
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

  it('all restored fields incl. bag come from the controller snapshot (B-F3/E-F9 landed — restoreRun hydrates sim bag)', () => {
    // Codex round 1: restoreRun now populates sim's bag from the save, so the
    // controller snapshot carries the restored bag/shop/rerollCount/trophy and
    // restore_from_save derives the whole client state from it (the old s.bag
    // override is gone). Diverge the raw persisted snapshot `s` from `c` to
    // prove the reducer reads `c`, not `s`.
    const snapshot = makeSerializedSnapshot();
    const controller = controllerSnapshotFrom(snapshot); // c.bag = 2 restored placements
    const divergedSnapshot: SerializedRunState = {
      ...snapshot,
      bag: { dimensions: snapshot.bag.dimensions, placements: [] },
      rerollCount: 99,
      trophy: 999,
    };

    const next = clientRunReducer(freshInitial(), {
      type: 'restore_from_save',
      snapshot: divergedSnapshot,
      controllerSnapshot: controller,
    });

    // Bag / shop / rerollCount / trophy all from `c`; the diverged raw-snapshot
    // values (empty bag, 99, 999) are ignored.
    expect(next.bag).toHaveLength(2);
    expect(next.bag[0]!.itemId).toBe('iron-sword');
    expect(next.bag[0]!.uid).toBe('p-0');
    expect(next.shop).toHaveLength(3);
    expect(next.shop[0]!.itemId).toBe('copper-coin');
    expect(next.state.rerollCount).toBe(2);
    expect(next.state.trophy).toBe(72);
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3b Step 1 — abandon_run reducer arm.
//
// Phase 1 ratification (decision-log.md 2026-05-21 § 5b.3b Phase 1
// halt-gate RATIFIED): client-side outcome flip; preserves the 7
// RunEndScreen-read fields beyond outcome. Distinct from reset_run
// (which wipes ALL state via createInitialState — destination
// ClassSelectScreen). abandon's destination is RunEndScreen ABANDONED.
// ────────────────────────────────────────────────────────────────────

describe('clientRunReducer — abandon_run (M1.5b PR 3 / 5b.3b Step 1)', () => {
  it('sets outcome to "abandoned" from a mid-run state', () => {
    const initial = freshInitial();
    const next = clientRunReducer(initial, { type: 'abandon_run' });
    expect(next.state.outcome).toBe('abandoned');
  });

  it('preserves the 7 RunEndScreen-read display fields byte-identical to pre-dispatch', () => {
    // Construct a mid-run state with non-default values across all 7
    // RunEndScreen-read fields beyond outcome (round, classId, relics,
    // totalRounds, history, maxHearts, hearts — see Step 0 item 3).
    const mid: ClientRunState = {
      ...freshInitial(),
      state: {
        ...freshInitial().state,
        outcome: 'in_progress' as RunOutcome,
        round: 7,
        classId: 'marauder' as ClassId,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: 'berserkers-pendant' as RelicId,
          boss: 'conquerors-crown' as RelicId,
        },
        totalRounds: 11,
        history: [
          { round: 1 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
          { round: 2 as RoundNumber, outcome: 'loss', damageDealt: 12, damageTaken: 30, goldEarnedThisRound: 0, opponentGhostId: null, opponentClassId: null },
        ],
        maxHearts: 5,
        hearts: 2,
      },
    };
    const next = clientRunReducer(mid, { type: 'abandon_run' });
    expect(next.state.outcome).toBe('abandoned');
    // 7 display fields preserved verbatim (round / classId / relics /
    // totalRounds / history / maxHearts / hearts).
    expect(next.state.round).toBe(mid.state.round);
    expect(next.state.classId).toBe(mid.state.classId);
    expect(next.state.relics).toBe(mid.state.relics);
    expect(next.state.totalRounds).toBe(mid.state.totalRounds);
    expect(next.state.history).toBe(mid.state.history);
    expect(next.state.maxHearts).toBe(mid.state.maxHearts);
    expect(next.state.hearts).toBe(mid.state.hearts);
  });

  it('is idempotent: abandon_run on an already-abandoned state stays abandoned with the same 7 fields', () => {
    const initial = freshInitial();
    const once = clientRunReducer(initial, { type: 'abandon_run' });
    const twice = clientRunReducer(once, { type: 'abandon_run' });
    expect(twice.state.outcome).toBe('abandoned');
    expect(twice.state.round).toBe(once.state.round);
    expect(twice.state.classId).toBe(once.state.classId);
    expect(twice.state.relics).toBe(once.state.relics);
    expect(twice.state.totalRounds).toBe(once.state.totalRounds);
    expect(twice.state.history).toBe(once.state.history);
    expect(twice.state.maxHearts).toBe(once.state.maxHearts);
    expect(twice.state.hearts).toBe(once.state.hearts);
  });

  it('does NOT wipe state via createInitialState (regression vs reset_run)', () => {
    // The supersession test: reset_run returns INITIAL_CLIENT_STATE
    // (createInitialState('tinker')) which sets classId 'tinker',
    // round 1, history []. abandon_run on a marauder mid-run state
    // must NOT mutate any of those toward those reset values.
    const marauder: ClientRunState = {
      ...freshInitial(),
      state: {
        ...freshInitial().state,
        classId: 'marauder' as ClassId,
        round: 9,
        history: [
          { round: 1 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
        ],
      },
    };
    const next = clientRunReducer(marauder, { type: 'abandon_run' });
    expect(next.state.classId).toBe('marauder'); // NOT 'tinker'
    expect(next.state.round).toBe(9); // NOT 1
    expect(next.state.history).toHaveLength(1); // NOT []
  });
});
