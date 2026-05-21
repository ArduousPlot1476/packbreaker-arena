// UI-side state machine for the run screen. Pure reducer + helpers; no
// React.
//
// M1.3.4a — sim wire-up + data.local dissolution. ShopController.ts now
// owns shop generation (sim-driven via @packbreaker/sim's generateShop).
// REROLL_POOL is gone; the reroll action handler delegates to
// ShopController. SEED_BAG and SEED_SHOP dissolved entirely — runs start
// at round 1 with an empty bag and a sim-generated initial shop. INITIAL
// became createInitialState() so each run-screen mount mints a fresh
// SimSeed (M1.5 persistence saves/restores seeds for replays).
//
// Reroll cost formula uses sim's computeRerollCost
// (rerollCostStart + rerollsThisRound * rerollCostIncrement, with the
// extraRerollsPerRound allowance from relics — Apprentice's Loop, M1.5
// — currently always 0). The prototype's `rerollCount + 1` produced the
// same numbers because DEFAULT_RULESET sets both costStart and
// costIncrement to 1; using sim's helper now keeps the formula
// authoritative when contracts mutate the levers.

import {
  CLASSES,
  DEFAULT_RULESET,
  type ClassId,
  type CombatResult,
  type ContractId,
  type GhostId,
  type RunId,
  type RunOutcome,
  type RunState as SimRunState,
  type SerializedRunState,
} from '@packbreaker/content';

import { generateInitialShop, generateShop } from '../shop/ShopController';
import { BAG_COLS, BAG_ROWS, cellsOf, placementValid } from '../bag/layout';
import { ITEMS } from './content';
import {
  computeRerollCost,
  emptyRelicSlots,
  makeRunSeed,
} from './sim-bridge';
import type { BagItem, Cell, ItemId, RecipeMatch, RunState, ShopSlot } from './types';
import type { DragState } from '../bag/types';

export interface ClientRunState {
  bag: BagItem[];
  shop: ShopSlot[];
  state: RunState;
  drag: DragState | null;
  hover: { col: number; row: number } | null;
  combatActive: boolean;
}

/** Mints a fresh ClientRunState for a new run. Seed is wall-clock-derived
 *  via sim-bridge.makeRunSeed; the round-1 shop is sim-generated.
 *
 *  M1.5b PR 1: takes a `classId` arg (was parameterless under M1.5a's
 *  M1_PROTOTYPE_CLASS hardcode). The class-select screen feeds the
 *  player-chosen classId through useRun → applySimSnapshot's init pass;
 *  the shop and className placeholder mint from the same classId here so
 *  the placeholder ClientRunState is internally consistent before sim
 *  attaches. Note: each call mints a NEW seed (wall-clock + Math.random).
 *  For tests that need determinism, construct fixtures explicitly rather
 *  than relying on the singleton. */
export function createInitialState(classId: ClassId): ClientRunState {
  const seed = makeRunSeed();
  const ruleset = DEFAULT_RULESET;
  const shop = generateInitialShop(seed, classId, ruleset);
  return {
    bag: [],
    shop,
    state: {
      round: 1,
      totalRounds: ruleset.maxRounds,
      hearts: ruleset.startingHearts,
      maxHearts: ruleset.startingHearts,
      gold: ruleset.baseGoldPerRound,
      trophy: 0,
      rerollCount: 0,
      className: CLASSES[classId]!.displayName,
      contractName: 'Neutral',
      contractText: 'No modifiers',
      ruleset,
      // Placeholders for the sim-derived fields (M1.5a PR 2 Phase 2b-1).
      // Written here so the type checks before init_from_sim's dispatch
      // overwrites them on mount; consumers never observe these
      // placeholders because RunProvider conditionally renders
      // ClassSelectScreen → RunBootFallback until simRun resolves.
      runId: '' as RunId,
      classId,
      contractId: 'neutral' as ContractId,
      derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
      relics: emptyRelicSlots(),
      outcome: 'in_progress' as RunOutcome,
      seed,
      history: [],
    },
    drag: null,
    hover: null,
    combatActive: false,
  };
}

/** Module-level singleton initial state. useRun uses this directly so
 *  state at first render matches what tests observe. The 'tinker'
 *  placeholder is a sentinel — never observed at runtime because
 *  RunProvider renders ClassSelectScreen until pendingRunInput resolves,
 *  then init_from_sim overwrites every sim-authoritative field. */
export const INITIAL_CLIENT_STATE: ClientRunState = createInitialState(
  'tinker' as ClassId,
);

// computeRerollCost is imported from run/sim-bridge.ts so the reducer's
// spend-deduction and ShopPanel / ShopTab affordability state share one
// authoritative source. The 4th arg (extraRerollsPerRound) now reads
// from state.derived.extraRerollsPerRound, populated by sync_from_sim
// (M1.5a PR 2 Phase 2b-2; EXTRA_REROLLS_PER_ROUND placeholder deleted).
// See sim-bridge.ts for the Codex P1 context on shared-formula
// discipline.

export type RunAction =
  | { type: 'pickup_bag'; uid: string; itemId: ItemId; rot: number }
  | { type: 'pickup_shop'; uid: string }
  | { type: 'drag_rotate' }
  | { type: 'drag_cancel' }
  | { type: 'set_hover'; hover: { col: number; row: number } | null }
  | { type: 'drop_bag'; col: number; row: number; newUid: string }
  | { type: 'sell_drop' }
  | { type: 'reroll' }
  | { type: 'combine'; match: RecipeMatch; newUid: string }
  | { type: 'continue_to_combat' }
  | {
      type: 'combat_done';
      result: CombatResult;
      opponentGhostId: GhostId | null;
      opponentClassId: ClassId | null;
      damageDealt: number;
      damageTaken: number;
      goldDelta: number;
    }
  | { type: 'init_from_sim'; snapshot: SimRunState }
  | { type: 'sync_from_sim'; snapshot: SimRunState }
  | { type: 'reset_run' }
  | {
      type: 'restore_from_save';
      /** Persisted SerializedRunState — canonical source for
       *  client-authoritative + SerializedRunState-only fields
       *  (bag.placements, shop.slots, rerollCount, trophy). */
      snapshot: SerializedRunState;
      /** Post-restoreRun controller snapshot — canonical source for
       *  sim-authoritative fields that restoreRun RECOMPOSES from
       *  current registries (ruleset, derived, derived maxHearts /
       *  className). Phase 2.5j-fix (Catch 26): cross-version restore
       *  must not let the stale persisted ruleset/derived leak into
       *  client.state.* — they'd diverge from sim's recomposed
       *  values, producing wrong reroll cost / shop gen on app-version
       *  bumps or content hot-fixes. See decision-log Catch 26 for
       *  the partition. */
      controllerSnapshot: SimRunState;
    };

/** Applies a sim RunState snapshot to ClientRunState. Q2 Amendment A
 *  bifurcated authority (M1.5a PR 2 Phase 1 ratification): sim is
 *  authoritative for hearts/history/derived/relics/outcome/ruleset/round/
 *  runId/classId/contractId/seed; client is authoritative for
 *  gold/rerollCount/bag/shop/trophy in M1.5a (sim only sees reroll +
 *  apply_combat_outcome routing in PR 2, so its gold tracking diverges
 *  from client's mid-round by sum(buy_costs) − sum(sell_proceeds);
 *  overwriting gold on sync would lose in-round shop transactions).
 *
 *  `includeGold` distinguishes init from sync:
 *    - init_from_sim (run-start): includeGold=true. Client and sim
 *      gold haven't diverged yet — sim's gold IS the source of truth.
 *    - sync_from_sim (mid-run): includeGold=false. Sim's gold is stale;
 *      client's gold is the live value. CF 34 migrates this to full
 *      sim-authoritative gold at M1.5b/LocalSaveV1.
 *
 *  bag is NOT touched by either init or sync — remains client-
 *  authoritative for M1.5a. shop is bootstrapped from sim's snapshot
 *  at the init_from_sim reducer arm post-applySimSnapshot (Phase 2.5b
 *  Codex response); sync continues to leave shop client-authoritative.
 *  contractName/contractText/totalRounds also untouched — they're
 *  derived placeholders the client owns. (className and maxHearts now
 *  derive from sim-authoritative classId and ruleset.startingHearts
 *  respectively, updated per sync — M1.5b PR 1 CF 39 fix + Finding A.)
 *
 *  trophy is locked client-authoritative for M1.5a per decision-log.md
 *  2026-05-11 § M1.5a Phase 1 design take-2 ratification §6e Q13; sim's
 *  snapshot.trophiesAtStart is between-runs cumulative state for M2
 *  (// M2 concern. at sim's getState L336) and is ignored by both init
 *  and sync. The +18-per-win accumulator lives in the combat_done
 *  reducer arm (Phase 2.5h Codex Finding 4 restore). */
function applySimSnapshot(
  state: ClientRunState,
  snapshot: SimRunState,
  includeGold: boolean,
): ClientRunState {
  return {
    ...state,
    state: {
      ...state.state,
      runId: snapshot.runId,
      seed: snapshot.seed,
      classId: snapshot.classId,
      contractId: snapshot.contractId,
      ruleset: snapshot.ruleset,
      derived: snapshot.derived,
      hearts: snapshot.hearts,
      maxHearts: snapshot.ruleset.startingHearts,
      className: CLASSES[snapshot.classId]!.displayName,
      round: snapshot.currentRound,
      relics: snapshot.relics,
      outcome: snapshot.outcome,
      history: snapshot.history.slice(),
      ...(includeGold ? { gold: snapshot.gold } : {}),
    },
  };
}

// Pure helper: computes placement of the combine output. Returns the new
// bag with the output placed, or null if no placement fits.
function placeCombineOutput(
  bag: BagItem[],
  match: RecipeMatch,
  newUid: string,
): BagItem[] | null {
  const inputs = match.uids
    .map((uid) => bag.find((b) => b.uid === uid))
    .filter((x): x is BagItem => Boolean(x));
  const cells = inputs.flatMap((b) => cellsOf(b));
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  const outDef = ITEMS[match.recipe.output];
  if (!outDef) return null;
  const newBagBase = bag.filter((b) => !match.uids.includes(b.uid));
  let placed: { col: number; row: number; rot: number } | null = null;
  const tryCells: Cell[] = [[minX, minY], ...cells];
  for (const [tx, ty] of tryCells) {
    for (const rot of [0, 90, 180, 270]) {
      if (placementValid(newBagBase, outDef.id, tx, ty, rot, null)) {
        placed = { col: tx, row: ty, rot };
        break;
      }
    }
    if (placed) break;
  }
  if (!placed) {
    outer: for (let y = 0; y < BAG_ROWS; y++) {
      for (let x = 0; x < BAG_COLS; x++) {
        for (const rot of [0, 90, 180, 270]) {
          if (placementValid(newBagBase, outDef.id, x, y, rot, null)) {
            placed = { col: x, row: y, rot };
            break outer;
          }
        }
      }
    }
  }
  if (!placed) return null;
  return [...newBagBase, { uid: newUid, itemId: outDef.id, ...placed }];
}

export function clientRunReducer(state: ClientRunState, action: RunAction): ClientRunState {
  switch (action.type) {
    case 'pickup_bag':
      if (state.combatActive) return state;
      return {
        ...state,
        drag: {
          itemId: action.itemId,
          rot: action.rot,
          fromBagUid: action.uid,
        },
      };

    case 'pickup_shop': {
      if (state.combatActive) return state;
      const slot = state.shop.find((s) => s.uid === action.uid);
      if (!slot || !slot.itemId) return state;
      const def = ITEMS[slot.itemId];
      if (!def || state.state.gold < def.cost) return state;
      return {
        ...state,
        drag: {
          itemId: slot.itemId,
          rot: 0,
          fromShopUid: action.uid,
          cost: def.cost,
        },
      };
    }

    case 'drag_rotate':
      if (!state.drag) return state;
      return { ...state, drag: { ...state.drag, rot: (state.drag.rot + 90) % 360 } };

    case 'drag_cancel':
      if (!state.drag && !state.hover) return state;
      return { ...state, drag: null, hover: null };

    case 'set_hover':
      return { ...state, hover: action.hover };

    case 'drop_bag': {
      if (!state.drag) return state;
      const drag = state.drag;
      const ok = placementValid(
        state.bag,
        drag.itemId,
        action.col,
        action.row,
        drag.rot,
        drag.fromBagUid ?? null,
      );
      if (!ok) {
        return { ...state, drag: null, hover: null };
      }
      if (drag.fromBagUid) {
        const fromUid = drag.fromBagUid;
        return {
          ...state,
          bag: state.bag.map((x) =>
            x.uid === fromUid ? { ...x, col: action.col, row: action.row, rot: drag.rot } : x,
          ),
          drag: null,
          hover: null,
        };
      }
      if (drag.fromShopUid) {
        const fromShop = drag.fromShopUid;
        const cost = drag.cost ?? 0;
        return {
          ...state,
          bag: [
            ...state.bag,
            {
              uid: action.newUid,
              itemId: drag.itemId,
              col: action.col,
              row: action.row,
              rot: drag.rot,
            },
          ],
          shop: state.shop.map((slot) =>
            slot.uid === fromShop ? { ...slot, itemId: null } : slot,
          ),
          state: { ...state.state, gold: state.state.gold - cost },
          drag: null,
          hover: null,
        };
      }
      return { ...state, drag: null, hover: null };
    }

    case 'sell_drop': {
      if (!state.drag || !state.drag.fromBagUid) {
        return { ...state, drag: null, hover: null };
      }
      const fromUid = state.drag.fromBagUid;
      const item = state.bag.find((b) => b.uid === fromUid);
      if (!item) {
        return { ...state, drag: null, hover: null };
      }
      const def = ITEMS[item.itemId];
      if (!def) return { ...state, drag: null, hover: null };
      const refund = Math.floor(def.cost * 0.5);
      return {
        ...state,
        bag: state.bag.filter((x) => x.uid !== fromUid),
        state: { ...state.state, gold: state.state.gold + refund },
        drag: null,
        hover: null,
      };
    }

    case 'reroll': {
      const ruleset = state.state.ruleset;
      const cost = computeRerollCost(
        state.state.rerollCount,
        ruleset.rerollCostStart,
        ruleset.rerollCostIncrement,
        state.state.derived.extraRerollsPerRound,
      );
      if (state.state.gold < cost) return state;
      const newSlots = generateShop(
        state.state.seed,
        state.state.round,
        state.state.classId,
        ruleset,
        state.state.rerollCount + 1,
      );
      return {
        ...state,
        shop: newSlots,
        state: {
          ...state.state,
          gold: state.state.gold - cost,
          rerollCount: state.state.rerollCount + 1,
        },
      };
    }

    case 'combine': {
      const newBag = placeCombineOutput(state.bag, action.match, action.newUid);
      if (!newBag) return state;
      return { ...state, bag: newBag };
    }

    case 'continue_to_combat':
      if (state.combatActive) return state;
      return { ...state, combatActive: true };

    case 'combat_done': {
      // M1.5a PR 2 Phase 2b-2 active routing cutover: all sim-authoritative
      // fields (hearts/history/round/derived/relics/outcome/trophy) were
      // mirrored by the prior sync_from_sim dispatch in onCombatDone.
      // state.state.round here is ALREADY the new (post-advancePhase) round
      // from that sync. Gold-delta is precomputed by the handler via
      // before/after sim.gold observation (β disposition — sim is single
      // source of truth for gold-mutation math; see useRun.ts onCombatDone).
      //
      // Bag + shop stay client-authoritative for M1.5a per Q2 Amendment A.
      // If sim's advancePhase didn't end the run, regenerate next round's
      // shop deterministically from the run seed at the new round. If the
      // run ended (sim's shouldEndRun fired → outcome != 'in_progress'),
      // shop is left as-is (run-end UX is M1.5+; CF 34/M1.5b reworks).
      const runEnded = state.state.outcome !== 'in_progress';
      const nextShop = runEnded
        ? state.shop
        : generateShop(
            state.state.seed,
            state.state.round,
            state.state.classId,
            state.state.ruleset,
            0,
          );
      // Trophy is client-authoritative for M1.5a per decision-log.md
      // 2026-05-11 § M1.5a Phase 1 design take-2 ratification §6e Q13.
      // Read the just-pushed history entry (sync_from_sim populated
      // history before combat_done dispatched) to derive win/loss; +18
      // per win is the M0-placeholder per decision-log.md 2026-05-02
      // § M1.3.4a ratification 5 (M2 trophy-curve work owns the real
      // schedule). Optional-chain defends against future refactors
      // where history could be empty at dispatch time.
      const lastHistoryEntry = state.state.history[state.state.history.length - 1];
      const trophyEarned = lastHistoryEntry?.outcome === 'win' ? 18 : 0;
      return {
        ...state,
        combatActive: false,
        shop: nextShop,
        drag: null,
        hover: null,
        state: {
          ...state.state,
          gold: state.state.gold + action.goldDelta,
          trophy: state.state.trophy + trophyEarned,
          rerollCount: 0,
        },
      };
    }

    case 'init_from_sim':
      return {
        ...applySimSnapshot(state, action.snapshot, /* includeGold */ true),
        shop: action.snapshot.shop.slots.map((itemId, i) => ({
          uid: `s${action.snapshot.currentRound}-${action.snapshot.shop.rerollsThisRound}-${i}`,
          itemId: itemId as ItemId,
        })),
      };

    case 'sync_from_sim':
      return applySimSnapshot(state, action.snapshot, /* includeGold */ false);

    case 'reset_run':
      return INITIAL_CLIENT_STATE;

    case 'restore_from_save': {
      // M1.5b PR 3 / 5b.3a Phase 2.5j-fix (Catch 26): hydrate
      // sim-authoritative fields (ruleset, derived, derived maxHearts/
      // className) from the POST-restoreRun controller snapshot — NOT
      // the persisted snapshot. The persisted ruleset/derived were
      // composed at save time and may be stale relative to the current
      // content registries (cross-version load, hot-fixes). sim's
      // restoreRun recomposes via composeRuleset(contract, classId,
      // relics) at construction time (state.ts:293-295); the recomposed
      // values are surfaced via controller.getState() and travel
      // through applySimSnapshot here. Client-authoritative fields
      // (bag.placements, shop.slots, gold via Amendment A) + the
      // SerializedRunState-only fields (rerollCount, trophy) continue
      // to come from `s` (the persisted snapshot).
      //
      // Field partition (Step 0 confirmed pre-fix):
      //   - controller (recomposed): ruleset, derived, maxHearts,
      //     className. Verbatim from controller: runId, seed, classId,
      //     contractId, startedAt, hearts, currentRound, relics,
      //     outcome, history (these match snapshot but pulling from
      //     controller keeps the source consistent).
      //   - snapshot (persisted): bag.placements, shop.slots,
      //     rerollCount, trophy. (gold via applySimSnapshot includeGold
      //     reads from `c` — which on restore equals snapshot.gold since
      //     the constructor restoreFrom branch sets this.gold =
      //     restoreFrom.gold; equivalent.)
      //   - SerializedRunState-only (NOT in RunState): rngState owned
      //     by sim internally, not in state.state. rerollCount + trophy
      //     are client-owned and overlaid below.
      //
      // Top-level bag is restored by converting BagState.placements (sim
      // shape: placementId/itemId/anchor/rotation) back to BagItem[] (client
      // shape: uid/itemId/col/row/rot). The save composer (useRun) uses
      // clientBagToSimBag at save time; this is the inverse impedance
      // bridge — uid is brand-cast to/from PlacementId per sim-bridge.ts
      // convention.
      //
      // Top-level shop bootstraps from snapshot.shop.slots (mirrors
      // init_from_sim's shop arm). At save time the quiescent invariant
      // (arranging-entry only) guarantees purchased=[] and
      // rerollsThisRound=0, so no purchased-null masking is needed.
      const s = action.snapshot;
      const c = action.controllerSnapshot;
      const base = applySimSnapshot(state, c, /* includeGold */ true);
      return {
        ...base,
        bag: s.bag.placements.map((p) => ({
          uid: String(p.placementId),
          itemId: p.itemId as ItemId,
          col: p.anchor.col,
          row: p.anchor.row,
          rot: p.rotation,
        })),
        shop: s.shop.slots.map((itemId, i) => ({
          uid: `s${s.currentRound}-${s.shop.rerollsThisRound}-${i}`,
          itemId: itemId as ItemId,
        })),
        state: {
          ...base.state,
          rerollCount: s.rerollCount,
          trophy: s.trophy,
        },
      };
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
