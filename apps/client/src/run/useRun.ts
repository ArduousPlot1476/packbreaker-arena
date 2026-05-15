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
import type { ClassId, CombatResult, ContractId, GhostId } from '@packbreaker/content';
import { CLASSES } from '@packbreaker/content';
// Type-only import — does NOT pull sim/state.ts → combat.ts into the
// main bundle (TS elides type-only imports at compile time; Vite
// chunk-splits only on runtime imports). The runtime createRun call
// goes through the dynamic import in the useEffect below.
import type { RunController as SimRunController } from '@packbreaker/sim';

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
import { ITEMS } from './content';
import type { DraggableData, DroppableData } from '../bag/types';
import {
  clientRunReducer,
  INITIAL_CLIENT_STATE,
  M1_PROTOTYPE_CLASS,
  type ClientRunState,
} from './RunController';
import { detectRecipes, scoutRecipes, type RecipeMatch } from './recipes';
import { computeRerollCost, makeRunSeed } from './sim-bridge';
import type { Recipe } from './types';

function makeUid(prefix: 'b' | 's'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function useRun() {
  const [state, dispatch] = useReducer(clientRunReducer, INITIAL_CLIENT_STATE);

  // Sim RunController instance — dynamic-imported on mount per Q3
  // disposition (M1.5a PR 2 Phase 1, A.1 lazy-boundary preservation).
  // Static import of createRun would drag sim/state.ts → combat.ts
  // into the main bundle, regressing tech-architecture.md § 10's
  // "title screen ships React + bag UI only" promise. RunProvider
  // renders RunBootFallback while this is null so consumers never
  // observe the placeholder INITIAL_CLIENT_STATE fields.
  const [simRun, setSimRun] = useState<SimRunController | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import('@packbreaker/sim').then(({ createRun }) => {
      if (cancelled) return;
      const controller = createRun({
        seed: makeRunSeed(),
        classId: M1_PROTOTYPE_CLASS,
        contractId: 'neutral' as ContractId,
        startingRelicId: CLASSES[M1_PROTOTYPE_CLASS]!.starterRelicPool[0]!,
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
  }, []);

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

  // CombatOverlay computes damageDealt / damageTaken / opponentGhostId /
  // opponentClassId at combat-end (it has the input + result on hand)
  // and forwards them to onCombatDone.
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
    simRun.advancePhase();
    const snapshot = simRun.getState();
    const goldDelta = snapshot.gold - goldBefore;
    dispatch({ type: 'sync_from_sim', snapshot });
    dispatch({ type: 'combat_done', goldDelta, ...payload });
  }, [simRun, state.state.outcome]);

  return {
    state,
    simRun,
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
  };
}
