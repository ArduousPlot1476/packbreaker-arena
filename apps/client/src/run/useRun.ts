// React hook wrapping clientRunReducer. As of commit 6, drag/drop
// coordination is delegated to @dnd-kit — the bound onDragStart /
// onDragOver / onDragEnd / onDragCancel handlers translate
// dnd-kit events into reducer actions. The R-key rotation listener is
// the only window-level event handler that remains: dnd-kit doesn't
// manage non-drag keyboard concerns.

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type {
  DragCancelEvent,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import type { ClassId, CombatResult, ContractId, GhostId, IsoTimestamp, RelicId } from '@packbreaker/content';
// Type-only import — does NOT pull sim/state.ts → combat.ts into the
// main bundle (TS elides type-only imports at compile time; Vite
// chunk-splits only on runtime imports). The runtime createRun call
// goes through the dynamic import in the useEffect below.
import type { RunController as SimRunController } from '@packbreaker/sim';
// Phase 2.5i (Codex PR #15 P2): import from the relicOffer module
// directly, NOT via @packbreaker/sim's root barrel. The root barrel
// re-exports state.ts → combat.ts (simulateCombat) via the run subbarrel,
// and a static-import edge to the root barrel makes useRun.ts's
// main-chunk membership structurally regressible against future
// barrel-composition changes. relicOffer.ts itself imports only
// @packbreaker/content + sim's rng module — zero coupling to state.ts —
// so a direct subpath import preserves the §2a A.1 lazy boundary
// (decision-log.md 2026-05-13) by construction.
import { generateBossRelicOffer, generateMidRelicOffer } from '@packbreaker/sim/src/run/relicOffer';
import { mirrorsSimShouldEndRun } from './runEnd';

/** Payload CombatOverlay forwards to the reducer's combat_done action.
 *  Damage values are pre-computed against the player's / ghost's
 *  startingHp + result.finalHp so the reducer doesn't need ghost.ts.
 *  opponentClassId added M1.5a PR 2 Phase 2b-2 (Q7 — threaded from
 *  ghost build for sim's applyCombatOutcome). */
export interface CombatDonePayload {
  result: CombatResult;
  opponentGhostId: GhostId | null;
  opponentClassId: ClassId | null;
  damageDealt: number;
  damageTaken: number;
}
import { ITEMS, SHOP_POOL_ITEMS } from './content';
import type { DraggableData, DroppableData } from '../bag/types';
import {
  clientRunReducer,
  INITIAL_CLIENT_STATE,
  type ClientRunState,
} from './RunController';
import { detectRecipes, scoutRecipes, type RecipeMatch } from './recipes';
import { computeRerollCost, makeRunSeed } from './sim-bridge';
import type { Recipe } from './types';

function makeUid(prefix: 'b' | 's'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Input the player commits at class-select. useRun gates createRun on
 *  this being non-null — until ClassSelectScreen calls beginRun, sim is
 *  not constructed and the run hasn't started.
 *
 *  M1.5b PR 1 Implementation C: replaces the M1_PROTOTYPE_CLASS hardcode
 *  that previously fed createRun at mount. The createRun useEffect now
 *  fires only after the player picks a class + starter — see
 *  RunContext.tsx for the gate that renders ClassSelectScreen vs
 *  RunBootFallback vs the run-screen children. */
export interface PendingRunInput {
  readonly classId: ClassId;
  readonly startingRelicId: RelicId;
}

export function useRun() {
  const [state, dispatch] = useReducer(clientRunReducer, INITIAL_CLIENT_STATE);

  // Sim RunController instance — dynamic-imported when pendingRunInput
  // resolves (M1.5b PR 1 Implementation C: class-select gate replaces
  // M1.5a's mount-time createRun). Static import of createRun would drag
  // sim/state.ts → combat.ts into the main bundle, regressing
  // tech-architecture.md § 10's "title screen ships React + bag UI only"
  // promise. RunProvider renders ClassSelectScreen until pendingRunInput
  // is set, then RunBootFallback while simRun resolves, so consumers
  // never observe the placeholder INITIAL_CLIENT_STATE fields.
  const [simRun, setSimRun] = useState<SimRunController | null>(null);
  const [pendingRunInput, setPendingRunInput] = useState<PendingRunInput | null>(
    null,
  );

  const beginRun = useCallback((input: PendingRunInput) => {
    setPendingRunInput(input);
  }, []);

  useEffect(() => {
    if (pendingRunInput === null) return;
    if (simRun !== null) return;
    let cancelled = false;
    void import('@packbreaker/sim').then(({ createRun }) => {
      if (cancelled) return;
      const controller = createRun({
        seed: makeRunSeed(),
        classId: pendingRunInput.classId,
        contractId: 'neutral' as ContractId,
        startingRelicId: pendingRunInput.startingRelicId,
        // M1.5b PR 3 / 5b.3a Commit 3: inject real wall-clock timestamp.
        // Sim's CreateRunInput.startedAt defaults to a fixed sentinel
        // ('2025-01-01T00:00:00.000Z') when omitted (state.ts § 200) —
        // fine for sim tests but wrong for production saves where
        // startedAt is persisted into SerializedRunState and surfaced
        // in telemetry. Client owns the clock per § 4.1 (sim is
        // environment-free).
        startedAt: new Date().toISOString() as IsoTimestamp,
        itemsRegistry: SHOP_POOL_ITEMS,
        onTelemetryEvent: () => {
          // Q6 disposition: stubbed in PR 2; M1.5b telemetry milestone
          // wires sim's emit surface to the client's PostHog pipeline
          // (CF 35). Currently a no-op to satisfy the optional callback.
        },
      });
      setSimRun(controller);
      dispatch({ type: 'init_from_sim', snapshot: controller.getState() });
    });
    return () => {
      cancelled = true;
    };
  }, [pendingRunInput, simRun]);

  const recipes = useMemo(() => detectRecipes(state.bag), [state.bag]);

  // scoutedRecipes: inventory-only matches (multiset; no adjacency).
  // Filtered to recipes whose id is NOT already a `recipes` (ready)
  // match — so the mobile Crafting tab's two sections stay disjoint:
  //   "Ready to combine" (recipes) — the player can tap COMBINE now.
  //   "Available with current items" (scoutedRecipes) — would need to
  //                                                    rearrange first.
  const scoutedRecipes = useMemo<Recipe[]>(() => {
    const ready = new Set(recipes.map((m) => m.recipe.id));
    return scoutRecipes(state.bag).filter((r) => !ready.has(r.id));
  }, [state.bag, recipes]);

  const dragRef = useRef<ClientRunState['drag']>(null);
  dragRef.current = state.drag;

  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key && e.key.toLowerCase() === 'r') {
        const d = dragRef.current;
        if (!d) return;
        const def = ITEMS[d.itemId];
        // Square items have rotation-invariant footprints — R is a no-op
        // (M0 ratification, decision-log 2026-04-26).
        if (def.w === def.h) return;
        dispatch({ type: 'drag_rotate' });
      }
    }
    // Mobile tap-tap rotate (M1.3.3 commit 7): while a drag is active,
    // a second finger touching the screen rotates the held item. Same
    // square-no-op gating as the R-key path. The first finger remains
    // down holding the drag (TouchSensor activation); the second
    // touchstart fires once per new touch contact.
    function touchStart(e: TouchEvent) {
      if (e.touches.length < 2) return;
      const d = dragRef.current;
      if (!d) return;
      const def = ITEMS[d.itemId];
      if (def.w === def.h) return;
      dispatch({ type: 'drag_rotate' });
    }
    window.addEventListener('keydown', key);
    window.addEventListener('touchstart', touchStart);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('touchstart', touchStart);
    };
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DraggableData | undefined;
    if (!data) return;
    if (data.kind === 'bag') {
      dispatch({ type: 'pickup_bag', uid: data.uid, itemId: data.itemId, rot: data.rot });
    } else if (data.kind === 'shop') {
      dispatch({ type: 'pickup_shop', uid: data.uid });
    }
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overData = event.over?.data.current as DroppableData | undefined;
    if (overData?.kind === 'cell') {
      dispatch({ type: 'set_hover', hover: { col: overData.col, row: overData.row } });
    } else {
      dispatch({ type: 'set_hover', hover: null });
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const overData = event.over?.data.current as DroppableData | undefined;
    if (overData?.kind === 'cell') {
      dispatch({ type: 'drop_bag', col: overData.col, row: overData.row, newUid: makeUid('b') });
    } else if (overData?.kind === 'sell') {
      dispatch({ type: 'sell_drop' });
    } else {
      dispatch({ type: 'drag_cancel' });
    }
  }, []);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    dispatch({ type: 'drag_cancel' });
  }, []);

  const onReroll = useCallback(() => {
    if (simRun === null) return;
    if (state.state.outcome !== 'in_progress') return;
    // Client-side gold gate (Amendment A: client owns gold).
    const ruleset = state.state.ruleset;
    const cost = computeRerollCost(
      state.state.rerollCount,
      ruleset.rerollCostStart,
      ruleset.rerollCostIncrement,
      state.state.derived.extraRerollsPerRound,
    );
    if (state.state.gold < cost) return;

    // Sim-side mirror — α disposition. Sim's rerollShop throws on its
    // own gold check (state.ts:518-522). Under Amendment A's bifurcation,
    // sim.gold goes stale after client buys/sells; catch the specific
    // insufficient-gold throw and degrade to client-only mutation (no
    // sync_from_sim — sim is provably stale on gold). Other throws
    // re-propagate per Q5 (trust invariants).
    let simMirrored = false;
    try {
      simRun.rerollShop();
      simMirrored = true;
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('rerollShop: insufficient gold')) {
        console.warn(
          '[useRun] sim/client gold divergence on reroll; client proceeds without sim mirror:',
          err.message,
        );
      } else {
        throw err;
      }
    }

    if (simMirrored) {
      dispatch({ type: 'sync_from_sim', snapshot: simRun.getState() });
    }
    dispatch({ type: 'reroll' });
  }, [simRun, state.state.derived.extraRerollsPerRound, state.state.gold, state.state.rerollCount, state.state.ruleset, state.state.outcome]);

  const onCombine = useCallback((match: RecipeMatch) => {
    dispatch({ type: 'combine', match, newUid: makeUid('b') });
  }, []);

  const onContinue = useCallback(() => {
    if (simRun === null) return;
    if (state.state.outcome !== 'in_progress') return;
    // Sim phase 'arranging' → 'combat'. No sync_from_sim: enterCombatPhase
    // only mutates phase, which is NOT in ClientRunState (Q2 disposition).
    simRun.enterCombatPhase();
    dispatch({ type: 'continue_to_combat' });
  }, [simRun, state.state.outcome]);

  // ─── M1.5a PR 3 Phase 2b + Phase 2d — relic offer + run-end ───────
  //
  // Unified pendingRelicOffer useMemo: boss-precedence branch (Phase
  // 2d) followed by mid branch (Phase 2b). Boss is tested first because
  // its predicate is tighter (round 11 + history-last win + boss empty)
  // and disjoint from mid in practice; boss-precedence avoids any path
  // where both could fire on the same render.
  //
  // Sim's grant gates (packages/sim/src/run/state.ts § grantRelic):
  //   mid:  phase === 'arranging' && currentRound >= 6 && relics.mid === null
  //   boss: phase === 'resolution' && lastHistory.round === 11 &&
  //         lastHistory.outcome === 'win' && relics.boss === null
  //
  // Client-observable equivalents — sim's RunState has NO phase field
  // (RunPhase lives only on RunController via getPhase(), not in
  // getState()'s snapshot; verified against content-schemas.ts § RunState
  // at PR 3 Phase 2b + Phase 2d Phase 1 take-1 S0d). The client tracks
  // combatActive as the stand-in for sim's 'arranging' AND 'resolution'
  // windows: sim is in one of those whenever !combatActive holds during
  // an in-progress run. For boss specifically, onCombatDone defers
  // advancePhase on the round-11-win-boss-empty branch (see below), so
  // post-applyCombatOutcome sim phase stays at 'resolution' and the
  // client observes outcome='in_progress' through the claim window.
  //
  // useMemo dep array uses state.state.history.length (NOT the array
  // reference) as the last-entry witness — sim's getState writes
  // history: this.history.slice() unconditionally (state.ts § getState),
  // and the client's applySimSnapshot does the same; the array reference
  // changes on every sync but the length only changes on actual
  // applyCombatOutcome appends. Append-only invariant means a length
  // delta is sufficient to detect any content change relevant to the
  // boss predicate.
  //
  // Generators are pure + deterministic over (runSeed, classId), so
  // re-renders that didn't change deps return the same card arrays and
  // the modal doesn't reshuffle.
  const pendingRelicOffer = useMemo<
    | { readonly slot: 'mid' | 'boss'; readonly cards: ReadonlyArray<RelicId> }
    | null
  >(() => {
    if (simRun === null) return null;
    if (state.state.outcome !== 'in_progress') return null;
    if (state.combatActive) return null;

    // Boss first — tighter gate (round 11 + win + boss slot empty).
    const last = state.state.history[state.state.history.length - 1];
    if (
      last !== undefined &&
      last.round === 11 &&
      last.outcome === 'win' &&
      state.state.relics.boss === null
    ) {
      const cards = generateBossRelicOffer(state.state.seed, state.state.classId);
      return { slot: 'boss', cards };
    }

    // Mid — round 6+, mid slot empty.
    if (state.state.round < 6) return null;
    if (state.state.relics.mid !== null) return null;
    const cards = generateMidRelicOffer(state.state.seed, state.state.classId);
    return { slot: 'mid', cards };
  }, [
    simRun,
    state.state.outcome,
    state.combatActive,
    state.state.round,
    state.state.relics.mid,
    state.state.relics.boss,
    state.state.history.length,
    state.state.seed,
    state.state.classId,
  ]);

  const isRunEnded = mirrorsSimShouldEndRun({ outcome: state.state.outcome });

  // M1.5b PR 2 Q(c) two-axis reset: clear the reducer state AND the
  // hook-level sim handle + pending-input flag so RunProvider falls
  // back to the simRun===null && pendingRunInput===null branch (which
  // mounts ClassSelectScreen). Without the dispatch the reducer would
  // retain the terminal outcome and RunEndScreen would stay mounted;
  // without the two state setters the createRun useEffect's
  // `if (simRun !== null) return;` guard would skip the next sim
  // construction even after a fresh class-select pick.
  //
  // 5b.3 LocalSaveV1 reuses this callback shape as the "abandon current
  // run" handler — same two-axis discard.
  const resetRun = useCallback(() => {
    dispatch({ type: 'reset_run' });
    setSimRun(null);
    setPendingRunInput(null);
  }, []);

  // Dispatches sim's grantRelic + sync_from_sim. Sim's M1.2.6 phase
  // gates are authoritative — client does NOT re-validate against the
  // offer (M1 trust model parity with grantRelic's slot/phase-only
  // validation; the modal's pendingRelicOffer-gated render is the
  // client-side containment).
  //
  // Phase 2d resume (Q1.b): when onCombatDone defers advancePhase for
  // a boss claim, sim is left at phase 'resolution'. After grantRelic
  // succeeds, simRun.getPhase() === 'resolution' is still true (grantRelic
  // does not transition phase), and we resume the deferred advancePhase
  // so sim reaches 'ended' for the round-11 win path. Phase-conditional
  // rather than slot-conditional so future deferred-transition slots
  // generalize cleanly. Use simRun.getPhase() — NOT simRun.getState().phase
  // — because RunState has no phase field (phase lives only on the
  // RunController instance; verified at Phase 1 take-1 S0d + take-2 S0l).
  const grantSelectedRelic = useCallback(
    (slot: 'mid' | 'boss', relicId: RelicId) => {
      if (simRun === null) return;
      if (state.state.outcome !== 'in_progress') return;
      simRun.grantRelic(slot, relicId);
      if (simRun.getPhase() === 'resolution') {
        simRun.advancePhase();
      }
      dispatch({ type: 'sync_from_sim', snapshot: simRun.getState() });
    },
    [simRun, state.state.outcome],
  );

  // CombatOverlay computes damageDealt / damageTaken / opponentGhostId /
  // opponentClassId at combat-end (it has the input + result on hand)
  // and forwards them to onCombatDone.
  //
  // Phase 2d boss-claim defer (Q2): after applyCombatOutcome transitions
  // sim to 'resolution', detect the round-11-win-boss-empty window and
  // SKIP advancePhase. The resolution-phase snapshot is then synced to
  // the client so pendingRelicOffer's boss branch fires; the deferred
  // advancePhase is resumed inside grantSelectedRelic phase-conditionally
  // (so the boss grant lands while sim is still in 'resolution', then
  // sim transitions to 'ended' via the resumed advancePhase). Predicate
  // mirrors the boss branch of the pendingRelicOffer useMemo — same three
  // readings; inline rather than helper because of the one call site.
  const onCombatDone = useCallback((payload: CombatDonePayload) => {
    if (simRun === null) return;
    if (state.state.outcome !== 'in_progress') return;
    // β disposition (Phase 2b-2 ratification): capture sim.gold before
    // bundled mutations. The reducer applies the sim-computed delta
    // (winBonus on win + baseIncomeForRound on advance, shouldEndRun-
    // guarded at sim state.ts:357-360). § 4.5 R2 strict enactment —
    // client recomputes nothing; sim is single source of truth for the
    // gold-delta math.
    const goldBefore = simRun.getState().gold;
    simRun.applyCombatOutcome({
      outcome: payload.result.outcome,
      damageDealt: payload.damageDealt,
      damageTaken: payload.damageTaken,
      endedAtTick: payload.result.endedAtTick,
      opponentGhostId: payload.opponentGhostId,
      opponentClassId: payload.opponentClassId,
    });
    const postApply = simRun.getState();
    const lastEntry = postApply.history[postApply.history.length - 1];
    const shouldDeferAdvance =
      lastEntry?.round === 11 &&
      lastEntry?.outcome === 'win' &&
      postApply.relics.boss === null;
    if (!shouldDeferAdvance) {
      simRun.advancePhase();
    }
    const snapshot = simRun.getState();
    const goldDelta = snapshot.gold - goldBefore;
    dispatch({ type: 'sync_from_sim', snapshot });
    dispatch({ type: 'combat_done', goldDelta, ...payload });
  }, [simRun, state.state.outcome]);

  return {
    state,
    simRun,
    pendingRunInput,
    beginRun,
    recipes,
    scoutedRecipes,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
    onReroll,
    onCombine,
    onContinue,
    onCombatDone,
    pendingRelicOffer,
    isRunEnded,
    grantSelectedRelic,
    resetRun,
  };
}
