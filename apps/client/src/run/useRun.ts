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
import {
  clientBagToSimBag,
  clientShopToSimShop,
  computeRerollCost,
  makeRunSeed,
} from './sim-bridge';
import type { Recipe } from './types';
import type { LocalSaveV1, SerializedRunState } from '@packbreaker/shared';
import type { RoundNumber } from '@packbreaker/content';
import { clearLocal, loadLocal, saveLocal } from '../persistence';
import {
  capture as telemetryCapture,
  defaultFetchTransport,
  initTelemetry,
} from '../telemetry/emit';
import { getOrCreateSessionId, resolveAnonId } from '../telemetry/identifiers';

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
  /** CF 55 (M1.5d PR 2): telemetry entry-mode, stamped by the entry path that
   *  seeds this input — 'class_select' via beginRun, 'replay_same_class' via
   *  replaySameClass. Required so the convergent createRun call always threads
   *  a concrete value (the two paths diverge here but converge at createRun). */
  readonly entryMode: 'class_select' | 'replay_same_class';
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

  // M1.5c PR 1: telemetry identifiers resolved once at mount.
  //
  // anonId — device-scoped uuid v4 persisted in LocalSaveV1.
  //   telemetryAnonId (schemas.ts:773). Lazy useState initializer
  //   reads loadLocal()?.telemetryAnonId; if empty/absent, generates
  //   a fresh uuid (resolveAnonId helper). Within-version field init —
  //   no schemaVersion bump, no CF 46 interaction. The save composer
  //   below writes this stateful value into the LocalSaveV1 envelope
  //   on the next quiescent save (round advance / terminal), so a
  //   freshly-minted anonId persists at the first natural save point.
  //   If the user closes the tab pre-first-save, the uuid is lost and
  //   regenerated next session — acceptable for an anon identifier.
  //
  // sessionId — per-tab uuid v4 stored in sessionStorage. Survives
  //   soft reloads (same tab), distinct per new tab. Generated once
  //   per tab via getOrCreateSessionId; threaded into sim's
  //   CreateRunInput.sessionId AND into emit.ts via initTelemetry so
  //   sim-emitted events and client-emitted events carry the same
  //   value. (emit.ts's enrich override is a no-op when both wire
  //   to the same value.)
  const [anonId] = useState<string>(() =>
    resolveAnonId(loadLocal()?.telemetryAnonId),
  );
  const [sessionId] = useState<string>(() => getOrCreateSessionId());

  // M1.5c PR 1: initialize the telemetry singleton once at mount with
  // the resolved identifiers + default fetch transport (POST /v1/
  // telemetry/batch). Idempotent — subsequent renders no-op via the
  // initTelemetry guard. Server endpoint lands in PR 2 (CF 49); the
  // default transport swallows fetch errors so an absent endpoint is
  // a silent no-op rather than a user-visible crash (Catch 21
  // throw-safety lineage).
  useEffect(() => {
    initTelemetry({
      transport: defaultFetchTransport(),
      sessionId,
      anonId,
    });
  }, [sessionId, anonId]);

  // M1.5b PR 3 / 5b.3a Phase 2.5 P1 fix (Catch 20): monotonic epoch ref
  // shared between the load-on-mount restore effect and the fresh-run
  // createRun effect. The restore effect captures epochRef.current at
  // start; the createRun effect bumps it synchronously when a fresh run
  // is initiated. If a fresh run starts during the restore's dynamic-
  // import window, the resolve callback observes a stale captured epoch
  // and aborts before setSimRun + dispatch, leaving the fresh run intact.
  //
  // useRef vs. state: React state captured in the closure would always
  // read null at effect-start (mount). A simRun-dep wouldn't help either
  // (it would re-fire the restore on transition). The ref is leaner and
  // mirrors the React idiom for "out-of-render mutable handles."
  const restoreEpochRef = useRef(0);

  // CF 55 (M1.5d PR 2): the fresh class-select path. beginRun accepts the
  // class-select payload (no entryMode — it is the sole caller, via
  // ClassSelectScreen.onConfirm) and stamps entryMode:'class_select'. Keeping
  // entryMode off ClassSelectScreen's prop contract localizes the tag here.
  const beginRun = useCallback((input: Omit<PendingRunInput, 'entryMode'>) => {
    setPendingRunInput({ ...input, entryMode: 'class_select' });
  }, []);

  // M1.5b PR 3 / 5b.3a Commit 5: load-on-mount. Before the class-select
  // gate fires, check localStorage for a v1 in-progress save. Per Phase 1
  // ratification: "if inProgressRun present and outcome==='in_progress',
  // restore; else fresh." Terminal saves are discarded by the predicate
  // here — the next saveLocal call (post-fresh-run arranging-entry)
  // overwrites the stale terminal save.
  //
  // Mount-only effect (empty deps). The `cancelled` flag covers unmount
  // during the import window; the epoch comparison (Phase 2.5 P1 fix /
  // Catch 20) covers the race where a fresh run is started during the
  // window — see restoreEpochRef declaration above.
  //
  // Phase 2.5h (Catch 22 / Class A): the loaded payload has already
  // passed the load-boundary shape validator (apps/client/src/
  // persistence/validate.ts), so the obvious throws (relics undefined,
  // history not-array, etc.) cannot reach restoreRun. The try/catch
  // here is the residual belt — restoreRun's own contract throws
  // (Unknown contractId / Unknown startingRelicId for content-registry
  // gaps, etc., state.ts:262-278) and any future deref the validator
  // doesn't yet cover fall through to a fresh-run fallback (simRun
  // stays null → ClassSelectScreen mounts). Dev-only console.warn so
  // the failure isn't silent during development.
  useEffect(() => {
    let cancelled = false;
    const myEpoch = restoreEpochRef.current;
    const saved = loadLocal();
    if (saved === null || saved.inProgressRun === null) return;
    if (saved.inProgressRun.outcome !== 'in_progress') return;
    const snapshot = saved.inProgressRun;
    void import('@packbreaker/sim').then(({ restoreRun }) => {
      if (cancelled) return;
      // Phase 2.5 P1 race-guard: if a fresh run was initiated during the
      // dynamic-import window, the createRun effect synchronously bumped
      // restoreEpochRef.current past myEpoch. Bail without clobbering the
      // fresh run's setSimRun + init_from_sim dispatch.
      if (restoreEpochRef.current !== myEpoch) return;
      let controller;
      try {
        controller = restoreRun(snapshot, {
          itemsRegistry: SHOP_POOL_ITEMS,
          sessionId,
          onTelemetryEvent: telemetryCapture,
        });
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn(
            '[useRun] restoreRun threw on a validator-passing payload; falling back to fresh-run path:',
            err,
          );
        }
        return;
      }
      setSimRun(controller);
      // Phase 2.5j-fix (Catch 26): pass the post-restoreRun controller
      // snapshot alongside the persisted snapshot. The reducer reads
      // sim-authoritative fields (ruleset, derived, maxHearts, etc.)
      // from controllerSnapshot — restoreRun recomposes them from
      // current registries via composeRuleset, so this is the cross-
      // version-safe source. snapshot is still canonical for
      // client-authoritative fields (bag, shop) + SerializedRunState-
      // only fields (rerollCount, trophy). See decision-log Catch 26
      // for the partition.
      dispatch({
        type: 'restore_from_save',
        snapshot,
        controllerSnapshot: controller.getState(),
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (pendingRunInput === null) return;
    if (simRun !== null) return;
    // Phase 2.5 P1 race-guard companion: synchronously invalidate any
    // pending restore BEFORE the dynamic import. Restore's resolve
    // callback observes the bumped epoch and bails.
    restoreEpochRef.current += 1;
    let cancelled = false;
    void import('@packbreaker/sim').then(({ createRun }) => {
      if (cancelled) return;
      const controller = createRun({
        seed: makeRunSeed(),
        classId: pendingRunInput.classId,
        contractId: 'neutral' as ContractId,
        startingRelicId: pendingRunInput.startingRelicId,
        // CF 55 (M1.5d PR 2): thread the entry-mode stamped at the divergent
        // set site (beginRun / replaySameClass) into the run_start emit.
        entryMode: pendingRunInput.entryMode,
        // M1.5b PR 3 / 5b.3a Commit 3: inject real wall-clock timestamp.
        // Sim's CreateRunInput.startedAt defaults to a fixed sentinel
        // ('2025-01-01T00:00:00.000Z') when omitted (state.ts § 200) —
        // fine for sim tests but wrong for production saves where
        // startedAt is persisted into SerializedRunState and surfaced
        // in telemetry. Client owns the clock per § 4.1 (sim is
        // environment-free).
        startedAt: new Date().toISOString() as IsoTimestamp,
        itemsRegistry: SHOP_POOL_ITEMS,
        sessionId,
        // M1.5c PR 1: sim's onTelemetryEvent wires through the
        // emit.ts chokepoint. Sim emits with this.sessionId (which
        // equals the value we passed in CreateRunInput.sessionId);
        // emit.ts re-stamps tsClient and enriches per the TelemetryBase
        // contract before batching to /v1/telemetry/batch. OUT-only —
        // no data flows back into sim.
        onTelemetryEvent: telemetryCapture,
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

  // M1.5c PR 1: latest-state ref for stable callbacks that emit
  // telemetry (today: abandonRun). useCallback(..., []) gives a
  // stable identity for consumers but closes over the first-render
  // state; the ref pattern (mirrors dragRef above) gives those
  // callbacks read-access to the current state without triggering
  // re-renders or breaking the stable identity. Updated every render
  // so the next callback invocation reads the latest values.
  const stateRef = useRef<ClientRunState>(state);
  stateRef.current = state;

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
  // 5b.3b SUPERSESSION (decision-log.md 2026-05-21 § 5b.3b Phase 1
  // halt-gate RATIFIED): the prior framing here noted that 5b.3
  // would reuse this callback shape as the "abandon current run"
  // handler. That was incorrect. abandon's destination is
  // RunEndScreen ABANDONED (RunProvider's isRunEnded gate, requires
  // simRun !== null + outcome 'abandoned'); reset_run's destination
  // is ClassSelectScreen (requires simRun === null). The two
  // contracts diverge on simRun handling: abandonRun (below)
  // PRESERVES simRun; resetRun NULLS it.
  const resetRun = useCallback(() => {
    // M1.5b PR 3 / 5b.3a: clear the persisted save before discarding
    // in-memory state. The next saveLocal (post-fresh-run arranging-entry)
    // would overwrite anyway, but explicit clear is belt-and-suspenders
    // for the "user explicitly chose to start fresh" intent and prevents
    // a stale save from briefly being load-on-mount-eligible if the user
    // reloads between resetRun and a fresh beginRun.
    clearLocal();
    dispatch({ type: 'reset_run' });
    setSimRun(null);
    setPendingRunInput(null);
  }, []);

  // M1.5d PR 1: "Play Again (same class)" run-end fast-path. Identical to
  // resetRun in every lifetime-bearing step (clearLocal preserves the
  // device-scoped envelope incl. telemetryAnonId; reducer → fresh
  // INITIAL_CLIENT_STATE; simRun nulled then rebuilt by the createRun
  // effect with a fresh makeRunSeed) — see decision-log.md 2026-05-26
  // § "M1.5d PR 1 scope" Rule-6 walk: every container is mechanism-
  // equivalent to resetRun. The ONLY divergence is the setPendingRunInput
  // payload: resetRun nulls it (→ ClassSelectScreen), replay pre-seeds it
  // with the just-ended run's class + starter relic (→ RunBootFallback →
  // createRun, bypassing class select). The fresh seed / fresh run is
  // minted by the same createRun effect either way. Read run-state via
  // stateRef (latest), mirroring abandonRun's stable-callback pattern.
  //
  // Defensive fallback: a terminal run always carries a starter relic
  // (run_start equips it), but if relics.starter is somehow null we route
  // through resetRun rather than seed an invalid PendingRunInput
  // (startingRelicId is non-nullable RelicId).
  const replaySameClass = useCallback(() => {
    const runState = stateRef.current.state;
    const starter = runState.relics.starter;
    if (starter === null) {
      resetRun();
      return;
    }
    clearLocal();
    dispatch({ type: 'reset_run' });
    setSimRun(null);
    // CF 55 (M1.5d PR 2): the Play-Again path stamps entryMode:'replay_same_class'.
    setPendingRunInput({
      classId: runState.classId,
      startingRelicId: starter,
      entryMode: 'replay_same_class',
    });
  }, [resetRun]);

  // M1.5b PR 3 / 5b.3b Step 2: abandon current run.
  // Mirrors resetRun's clearLocal-before-dispatch pattern (prevents
  // reload-resurrection between abandon-confirm and RunEndScreen mount),
  // but DOES NOT null simRun / pendingRunInput — abandon's destination
  // is RunEndScreen ABANDONED which requires simRun !== null to pass
  // RunProvider's first block (RunContext.tsx:69). Reducer's abandon_run
  // arm flips outcome to 'abandoned' while preserving the 7
  // RunEndScreen-read display fields. From the terminal screen, the
  // restart affordance (onRestart={value.resetRun}) is the path back
  // to ClassSelect — abandon ends here.
  //
  // M1.5c PR 1 (CF 35 closure surface): client-side emit of
  // run_end{outcome:'abandoned'} BEFORE the dispatch. The
  // client-side-flip lean means sim never sees the abandon, so sim's
  // own onTelemetryEvent path doesn't fire — this site owns the
  // abandon emit. capture() flows through emit.ts's enrich pipeline
  // (re-stamp tsClient, inject sessionId) and into the batched
  // transport. Read run-state via stateRef (latest), not closure —
  // the useCallback's empty deps keep abandonRun stable; the ref
  // mirrors the dragRef pattern at L289-290.
  const abandonRun = useCallback(() => {
    const runState = stateRef.current.state;
    telemetryCapture({
      // TelemetryBase placeholders — emit.ts.enrich overrides both.
      tsClient: '' as IsoTimestamp,
      sessionId: '',
      name: 'run_end',
      runId: runState.runId,
      outcome: 'abandoned',
      roundReached: runState.round as RoundNumber,
      heartsRemaining: runState.hearts,
    });
    clearLocal();
    dispatch({ type: 'abandon_run' });
  }, []);

  // M1.5b PR 3 / 5b.3a Commit 5: save-on-quiescent. Persist a
  // LocalSaveV1 whenever simRun is non-null AND (round or outcome)
  // transitions. Per Phase 1 ratification, quiescent points are
  // arranging-entry (round advanced) + terminal outcome — both
  // observable as React state changes through the dependency array.
  //
  // Initial mount fires once (simRun goes from null to non-null),
  // capturing the round-1 arranging-entry. Subsequent combat_done
  // dispatches that flip round or outcome fire again. Buys/sells/
  // rerolls/drags don't change round or outcome, so they don't trip
  // this effect — matching the quiescent invariant exactly.
  //
  // Composition: snapshot.bag and snapshot.shop are REPLACED with the
  // client's authoritative bag + shop (sim's bag is empty in M1.5a per
  // Q2 Amendment A; sim's shop diverges from client's mid-round under
  // the Amendment A authority split — rerolls aren't fully mirrored
  // sim-side). Phase 2.5h (Catch 23 / Class B) restored shop to the
  // client-sourced override list: pre-fix, save read sim's shop and
  // restoreRun regenerated it via makeShop, producing a save→load→save
  // cursor drift. Now: save reads client.shop verbatim, restoreRun
  // restores verbatim, idempotent round-trip. rngState pulled from
  // sim (post-advancePhase makeShop, which IS valid RNG consumption —
  // advancePhase is a quiescent transition, not the restore branch).
  // rerollCount + trophy lifted from client state.state.
  //
  // Cross-session fields (trophies, dailyStreak, lastDailyAttempted,
  // tutorialCompleted) are stubbed for 5b.3a — no surfaces exist yet
  // to mutate them. M2 will wire them. telemetryAnonId is resolved
  // and persisted as of M1.5c PR 1: useState lazy initializer reads
  // the existing persisted value via loadLocal() and falls back to a
  // fresh crypto.randomUUID() (resolveAnonId helper), then this
  // composer writes the stateful `anonId` into the LocalSaveV1
  // envelope on every quiescent save. Within-version field init;
  // no schemaVersion bump.
  useEffect(() => {
    if (simRun === null) return;
    // Phase 2.5 (5b.3b Codex round 1, P1): when client outcome is
    // terminal, clear the persisted save and bail. Two reasons it
    // CANNOT be an in_progress write:
    //   - The 5b.3b client-side-flip lean (decision-log.md 2026-05-21
    //     § 5b.3b Phase 1 halt-gate RATIFIED) leaves sim's outcome at
    //     'in_progress' even after abandon. The serializer below
    //     reads simSnap.outcome via the spread — pre-fix, abandon's
    //     re-fire here wrote `outcome:'in_progress'` over the
    //     pre-dispatch clearLocal, so reload re-imported the run and
    //     defeated user-confirmed abandon (Codex P1).
    //   - For natural terminals (won/eliminated), sim does flip its
    //     own outcome correctly, but the load-on-mount restore guard
    //     above already skips any save with outcome !== 'in_progress'
    //     — those persisted terminal saves were dead storage. Clearing
    //     them uniformly is hygiene.
    // The client outcome is the single source of truth for the
    // user-visible run state (sim's outcome may lag under the
    // client-side-flip lean), so the guard reads state.state.outcome.
    // abandonRun's explicit pre-dispatch clearLocal stays as belt-
    // and-suspenders for the window between dispatch and this
    // effect's re-fire.
    if (state.state.outcome !== 'in_progress') {
      clearLocal();
      return;
    }
    const simSnap = simRun.getState();
    const serialized: SerializedRunState = {
      ...simSnap,
      // Client-authoritative overrides (per Phase 1 field-sourcing table
      // under B2′; shop added at Phase 2.5h per the meta-audit
      // remediation). At save time (arranging-entry) client.shop has
      // non-null slots and rerollCount=0 per the quiescent invariant
      // (Step 0 #1 confirmed); clientShopToSimShop maps directly.
      gold: state.state.gold,
      bag: clientBagToSimBag(state.bag, simSnap.ruleset.bagDimensions),
      shop: clientShopToSimShop(state.shop, state.state.rerollCount),
      // SerializedRunState-only fields.
      rngState: simRun.getRngState(),
      rerollCount: state.state.rerollCount,
      trophy: state.state.trophy,
    };
    const payload: LocalSaveV1 = {
      schemaVersion: 1,
      trophies: 0,
      dailyStreak: 0,
      lastDailyAttempted: null,
      tutorialCompleted: false,
      telemetryAnonId: anonId,
      inProgressRun: serialized,
    };
    saveLocal(payload);
    // Deps intentionally narrow: round + outcome are the only
    // quiescent-transition signals. state.state.gold/bag/rerollCount
    // /trophy ARE read inside the effect (via closure) but are NOT in
    // deps — adding them would fire save on every buy/sell/reroll
    // (violating the quiescent invariant). React reads the latest
    // closure values when the effect runs, so the saved payload is
    // current relative to round/outcome transitions.
  }, [simRun, state.state.round, state.state.outcome]);

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
    replaySameClass,
    abandonRun,
  };
}
