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
  type ContractId,
  type RunId,
  type RunOutcome,
  type RunState as SimRunState,
  type SerializedRunState,
} from '@packbreaker/content';

import {
  emptyRelicSlots,
  makeRunSeed,
  simBagToClientBag,
  simShopToClientShop,
} from './sim-bridge';
import type { BagItem, ItemId, RunState, ShopSlot } from './types';
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
  return {
    bag: [],
    // Placeholder — overwritten by init_from_sim before first render
    // (RunProvider shows RunBootFallback until simRun resolves). The
    // authoritative shop is sim-generated + client-overridden (B2) then
    // projected via simShopToClientShop. Post CF 34 / M1.5e PR 1.
    shop: [],
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
      bossRewardItemId: null,
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
  | { type: 'continue_to_combat' }
  // combat_done carries no payload post CF 34 / M1.5e PR 1: sim owns all
  // post-combat state; onCombatDone syncs from sim, then this only lowers
  // the overlay. (buy/sell/reroll/combine actions retired — routed to sim.)
  | { type: 'combat_done' }
  | { type: 'init_from_sim'; snapshot: SimRunState }
  | { type: 'sync_from_sim'; snapshot: SimRunState }
  | { type: 'reset_run' }
  | { type: 'abandon_run' }
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

/** Projects a sim RunState snapshot onto ClientRunState. Post CF 34 / M1.5e
 *  PR 1 the sim is the SOLE authority for gold / rerollCount / bag / shop /
 *  trophy (Q2 Amendment A unwound), so every one is derived from the snapshot
 *  and the client keeps no parallel copy. Top-level bag/shop are the
 *  client-shape projections the UI renders (via the sim-bridge reverse adapters
 *  simBagToClientBag / simShopToClientShop); state.state.bag/shop mirror the
 *  canonical sim shapes. className + maxHearts derive from sim-authoritative
 *  classId + ruleset.startingHearts. One path for init_from_sim AND
 *  sync_from_sim — the old includeGold init/sync split is gone (sim's gold is
 *  always authoritative now). trophiesAtStart stays a dead sim stub (M2;
 *  removal deferred to PR 2). */
function applySimSnapshot(state: ClientRunState, snapshot: SimRunState): ClientRunState {
  return {
    ...state,
    bag: simBagToClientBag(snapshot.bag),
    shop: simShopToClientShop(snapshot),
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
      // CF-67: materialize null defensively — the snapshot field is optional-typed
      // (RunState.bossRewardItemId?), though a live getState always emits it.
      bossRewardItemId: snapshot.bossRewardItemId ?? null,
      outcome: snapshot.outcome,
      history: snapshot.history.slice(),
      gold: snapshot.gold,
      rerollCount: snapshot.rerollCount,
      trophy: snapshot.trophy,
    },
  };
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
      // Affordability + drag cost read the effective price synced from sim
      // (slot.cost = effectiveItemCost — the value sim.buyItem actually
      // charges), so the gate matches the deduction (B1). No client cost math;
      // sim re-validates authoritatively on buyItem.
      if (state.state.gold < slot.cost) return state;
      return {
        ...state,
        drag: {
          itemId: slot.itemId,
          rot: 0,
          fromShopUid: action.uid,
          cost: slot.cost,
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

    case 'continue_to_combat':
      if (state.combatActive) return state;
      return { ...state, combatActive: true };

    case 'combat_done':
      // Post-combat: sim is the authority for gold/trophy/rerollCount/shop, and
      // onCombatDone dispatches sync_from_sim (which derives all of them from
      // the sim snapshot) BEFORE this arm — so combat_done only lowers the
      // combat overlay + clears any stray drag. Next-round shop regen is
      // sim-side (advancePhase → makeShop, then the client's overrideShopSlots
      // + sync). The β gold-capture-delta workaround and the client trophy
      // accumulator are both retired here (CF 34 / M1.5e PR 1).
      return { ...state, combatActive: false, drag: null, hover: null };

    case 'init_from_sim':
      return applySimSnapshot(state, action.snapshot);

    case 'sync_from_sim':
      return applySimSnapshot(state, action.snapshot);

    case 'reset_run':
      return INITIAL_CLIENT_STATE;

    case 'abandon_run':
      // M1.5b PR 3 / 5b.3b: client-side outcome flip to 'abandoned'.
      // Distinct from reset_run by contract: reset_run wipes ALL state
      // via createInitialState (destination ClassSelectScreen); abandon
      // preserves the 7 RunEndScreen-read display fields (round /
      // classId / relics / totalRounds / history / maxHearts / hearts)
      // and ONLY flips outcome so RunProvider's isRunEnded gate routes
      // to RunEndScreen ABANDONED. The clearLocal-on-abandon hook lives
      // in useRun.ts's abandonRun callback (mirrors resetRun's
      // clearLocal-before-dispatch pattern); per Phase 1 ratification,
      // the callback does NOT setSimRun(null) — abandon's destination
      // requires simRun !== null to pass RunProvider's first block.
      //
      // combatActive note (Phase 2.5 meta-audit C.1): this arm does not
      // touch combatActive. If the user abandons during combat (⋯ is
      // accessible from TopBar regardless of phase), the value stays
      // true in state, but RunProvider's terminal gate unmounts the
      // entire in-run subtree (including CombatOverlay) on the same
      // render — so the stale flag is inert until the user clicks
      // Restart from RunEndScreen, which dispatches reset_run and
      // returns INITIAL_CLIENT_STATE (combatActive: false). Functionally
      // clean; explicit note here so future readers don't add a defensive
      // combatActive reset that would shadow the unmount semantics.
      return { ...state, state: { ...state.state, outcome: 'abandoned' } };

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
      // B-F3/E-F9 landed (M1.5e PR 1 Codex round 1): restoreRun now hydrates
      // sim's bag from the saved placements, so the controller snapshot `c`
      // carries the restored bag/shop/gold/rerollCount/trophy — applySimSnapshot
      // derives the full client state from it (ruleset/derived are `c`'s
      // recomposed, cross-version-safe values per Catch 26). The former
      // `bag: simBagToClientBag(action.snapshot.bag)` override is now REDUNDANT
      // (c.bag === action.snapshot.bag after restore) and removed. This closes
      // the Codex P1: pre-B-F3 the empty sim bag wiped the restored bag on the
      // first sync_from_sim after restore.
      const c = action.controllerSnapshot;
      return applySimSnapshot(state, c);
    }

    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
