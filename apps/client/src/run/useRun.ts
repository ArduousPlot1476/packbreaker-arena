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
import type {
  ClassId,
  CombatResult,
  ContractId,
  GhostId,
  IsoTimestamp,
  ItemId,
  PlacementId,
  RecipeId,
  RelicId,
  Rotation,
} from '@packbreaker/content';
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
import { ICONNED_RECIPES, ITEMS, SHOP_POOL_ITEMS } from './content';
import { generateShop } from '../shop/ShopController';
import { placementValid } from '../bag/layout';
import type { DraggableData, DroppableData } from '../bag/types';
import {
  clientRunReducer,
  INITIAL_CLIENT_STATE,
  type ClientRunState,
} from './RunController';
import { combineMatchKey, detectRecipes, scoutRecipes, type RecipeMatch } from './recipes';
import {
  clientBagToSimBag,
  clientShopToSimShop,
  makeRunSeed,
} from './sim-bridge';
import type { Recipe } from './types';
import type { RoundResultReport } from './usePlayerSavePush';
import type { LocalSaveV1, SerializedRunState } from '@packbreaker/shared';
import type { RoundNumber } from '@packbreaker/content';
import { clearLocal, loadLocal, saveLocal } from '../persistence';
import {
  capture as telemetryCapture,
  defaultFetchTransport,
  initTelemetry,
} from '../telemetry/emit';
import { getOrCreateSessionId, mintPushRunId, resolveAnonId } from '../telemetry/identifiers';

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

/** A boss-win offer card — a relic OR (CF-67) a fixed Legendary item. The
 *  discriminated union lets RelicOfferModal render + dispatch each kind, and
 *  future-proofs the M2 random-Epic leg as another kind:'item' card. */
export type OfferCard =
  | { readonly kind: 'relic'; readonly relicId: RelicId }
  | { readonly kind: 'item'; readonly itemId: ItemId };

/** The fixed Legendary item offered as the second boss-win reward option
 *  (CF-67, balance-bible.md § 15). */
const BOSS_REWARD_ITEM_ID = 'world-forged-heart' as ItemId;

export interface UseRunOptions {
  /** CF-77 Phase 2 PR2 (R7): invoked by useRun's per-round PRODUCER effect with
   *  one completed round {runId, round, roundOutcome} as soon as it resolves
   *  (keyed on history.length), so the server can compute + apply the trophy
   *  delta. Renamed from CF-75's `onQuiescentSave` (which rode the local-save
   *  trigger and carried a whole LocalSaveV1) — the Delta model reports a ROUND,
   *  not a snapshot. Injected by RunProvider, which wraps the push in the
   *  session-scoped ordered-delivery queue (R5); useRun stays auth/network-free
   *  and unit-testable. Fire-and-forget; must not throw. */
  readonly onRoundResult?: (result: RoundResultReport) => void;
}

export function useRun(options: UseRunOptions = {}) {
  const { onRoundResult } = options;
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

  // CF-77 Phase 2 PR2 (R3): the run's opaque PUSH id — a fresh uuid v4 minted
  // once per run and PERSISTED into SerializedRunState.pushRunId, so a
  // restore-from-save reuses the SAME id and the server's applied_round_results
  // composite PK absorbs a post-restore producer refire as a no-op. NOT
  // RunState.runId (`run-${seed}`, 32-bit, collision-prone). One ref, two
  // set-sites — the create effect mints via ensureFreshPushRunId; the restore
  // effect reads it through from the snapshot — mirroring the entryMode
  // divergent-set / convergent-read pattern.
  //
  // useRef (not useState) so mutating it never re-renders, and the mint is
  // lazy-guarded (only when null) so StrictMode's dev double-mount (main.tsx)
  // cannot mint two ids for one run — both mounts read the same value and PUT an
  // identical runId, which the server PK collapses. resetRun / replaySameClass
  // null it so a genuinely new run re-mints. Deliberately NOT an unconditional
  // mint in a bare effect body — the null-guard is what makes it idempotent.
  const pushRunIdRef = useRef<string | null>(null);
  const ensureFreshPushRunId = useCallback((): string => {
    if (pushRunIdRef.current === null) {
      pushRunIdRef.current = mintPushRunId();
    }
    return pushRunIdRef.current;
  }, []);

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
          // CF 37: same iconned recipe registry as createRun.
          recipesRegistry: ICONNED_RECIPES,
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
      // CF-77 Phase 2 PR2 (R3): READ THROUGH the persisted push id — a restored
      // run must reuse its original id so already-applied rounds are absorbed by
      // the server PK on the producer's refire rather than re-credited under a
      // fresh id. A legacy save lacking the field (undefined) mints fresh, which
      // is SAFE: nothing was ever pushed under it. Set BEFORE setSimRun so the
      // quiescent-save effect (fired by the simRun transition) persists this id.
      pushRunIdRef.current = snapshot.pushRunId ?? mintPushRunId();
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
        // CF 37: thread the client's iconned-filtered recipe list so sim's
        // combine detection uses the SAME set the client renders (resolves the
        // recipesRegistry sim-default vs client-filter divergence — sim's
        // unfiltered default would otherwise match non-iconned recipes).
        recipesRegistry: ICONNED_RECIPES,
        sessionId,
        // M1.5c PR 1: sim's onTelemetryEvent wires through the
        // emit.ts chokepoint. Sim emits with this.sessionId (which
        // equals the value we passed in CreateRunInput.sessionId);
        // emit.ts re-stamps tsClient and enriches per the TelemetryBase
        // contract before batching to /v1/telemetry/batch. OUT-only —
        // no data flows back into sim.
        onTelemetryEvent: telemetryCapture,
      });
      // B2 Option 1: sim's makeShop(1) generated the round-1 shop from this.rng
      // (kept for 224-fixture stability); overwrite with the client's
      // shopSeedFor items so the player sees the deterministic shop.
      {
        const snap = controller.getState();
        controller.overrideShopSlots(
          generateShop(
            snap.seed,
            snap.currentRound,
            snap.classId,
            snap.ruleset,
            snap.shop.rerollsThisRound,
          ).map((s) => s.itemId!),
        );
      }
      // CF-77 Phase 2 PR2 (R3): mint the run's PUSH id on the create path.
      // Idempotent under StrictMode's dev double-mount (the guard reuses the
      // first mint). Set BEFORE setSimRun so the first quiescent save persists it.
      ensureFreshPushRunId();
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

  // Transient "no room to place the output" signal for a combine the
  // sim rejected (findCombineRotation returned null → combineRecipe
  // threw). Keyed by the tapped match's combineMatchKey so the CTA that
  // was clicked (RecipeGlow overlay / CraftingTab row) can show an inline
  // message instead of the tap silently no-op'ing. NOT a fit-predicate or
  // glow-gate (those are CF 65) — purely surfaces the already-thrown
  // rejection. Clears on any bag mutation (rearrange or a successful
  // combine, both of which change state.bag) and on a 2.5s timeout.
  const [combineRejection, setCombineRejection] = useState<string | null>(null);
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setCombineRejection(null);
    if (rejectTimer.current !== null) {
      clearTimeout(rejectTimer.current);
      rejectTimer.current = null;
    }
  }, [state.bag]);
  useEffect(
    () => () => {
      if (rejectTimer.current !== null) clearTimeout(rejectTimer.current);
    },
    [],
  );

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

  // Drop-commit routing (CF 34 / M1.5e PR 1): the drag STATE stays client-side
  // (pickup / rotate / hover), but the COMMIT dispatches sim actions and syncs
  // the result — sim is the sole writer of bag/shop/gold. Placement validity is
  // gated with the same placementValid the bag hover uses (a UI concern), so an
  // invalid drop cancels without a buy; sim re-validates authoritatively.
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const overData = event.over?.data.current as DroppableData | undefined;
      const drag = dragRef.current;
      const sim = simRun;
      if (drag === null || sim === null) {
        dispatch({ type: 'drag_cancel' });
        return;
      }
      if (overData?.kind === 'cell') {
        const anchor = { col: overData.col, row: overData.row };
        const rotation = drag.rot as Rotation;
        const ok = placementValid(
          stateRef.current.bag,
          drag.itemId,
          anchor.col,
          anchor.row,
          drag.rot,
          drag.fromBagUid ?? null,
        );
        if (ok) {
          try {
            if (drag.fromBagUid) {
              sim.moveItem(drag.fromBagUid as PlacementId, anchor, rotation);
            } else if (drag.fromShopUid) {
              const slotIndex = stateRef.current.shop.findIndex(
                (s) => s.uid === drag.fromShopUid,
              );
              if (slotIndex >= 0) {
                sim.buyItem(slotIndex);
                sim.placeItem(drag.itemId, anchor, rotation);
              }
            }
            dispatch({ type: 'sync_from_sim', snapshot: sim.getState() });
          } catch (err) {
            // Sim rejected (placement/affordability). The client gates above
            // should preclude this; on a genuine invariant break, cancel the
            // drag without mutation rather than crash the run.
            if (import.meta.env.DEV) {
              console.warn('[useRun] sim rejected drop; cancelling drag:', err);
            }
          }
        }
        dispatch({ type: 'drag_cancel' });
      } else if (overData?.kind === 'sell') {
        if (drag.fromBagUid) {
          try {
            sim.sellItem(drag.fromBagUid as PlacementId);
            dispatch({ type: 'sync_from_sim', snapshot: sim.getState() });
          } catch (err) {
            if (import.meta.env.DEV) {
              console.warn('[useRun] sim rejected sell; cancelling drag:', err);
            }
          }
        }
        dispatch({ type: 'drag_cancel' });
      } else {
        dispatch({ type: 'drag_cancel' });
      }
    },
    [simRun],
  );

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    dispatch({ type: 'drag_cancel' });
  }, []);

  const onReroll = useCallback(() => {
    if (simRun === null) return;
    if (state.state.outcome !== 'in_progress') return;
    // Sim is authoritative — no client gold gate, no α try/catch. rerollShop
    // throws on insufficient gold, but the reroll CTA is disabled when
    // unaffordable (ShopPanel/ShopTab gate computeRerollCost vs synced gold),
    // so a throw here would be a genuine invariant break — let it propagate (Q5).
    simRun.rerollShop();
    // B2 Option 1: rerollShop consumed this.rng (kept for 224-fixture
    // stability); overwrite the stored slots with the client's shopSeedFor
    // items (what the player sees). See sim.overrideShopSlots STOPGAP.
    const snap = simRun.getState();
    simRun.overrideShopSlots(
      generateShop(
        snap.seed,
        snap.currentRound,
        snap.classId,
        snap.ruleset,
        snap.shop.rerollsThisRound,
      ).map((s) => s.itemId!),
    );
    dispatch({ type: 'sync_from_sim', snapshot: simRun.getState() });
  }, [simRun, state.state.outcome]);

  const onCombine = useCallback(
    (match: RecipeMatch) => {
      if (simRun === null) return;
      if (state.state.outcome !== 'in_progress') return;
      // Combine EXECUTION is sim-authoritative (CF 34 / CF 37). Pass the SELECTED
      // match's exact input placements (match.uids === placementIds post-flip) so
      // sim consumes the cluster the player clicked, not whichever it detects
      // first when a recipe has multiple ready matches (Codex P2, Finding 2).
      // The client detector only drives the CTA.
      try {
        simRun.combineRecipe(
          match.recipe.id as RecipeId,
          match.uids.map((u) => u as PlacementId),
        );
        dispatch({ type: 'sync_from_sim', snapshot: simRun.getState() });
      } catch (err) {
        // The output could not be placed in the freed footprint. Surface it
        // at the tapped CTA instead of silently swallowing (the tap otherwise
        // appears dead). Success path needs no explicit clear — the
        // dispatch above mutates state.bag, and the [state.bag] effect clears.
        if (import.meta.env.DEV) {
          console.warn('[useRun] sim rejected combine; surfacing to CTA:', err);
        }
        setCombineRejection(combineMatchKey(match));
        if (rejectTimer.current !== null) clearTimeout(rejectTimer.current);
        rejectTimer.current = setTimeout(() => {
          setCombineRejection(null);
          rejectTimer.current = null;
        }, 2500);
      }
    },
    [simRun, state.state.outcome],
  );

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
    | { readonly slot: 'mid' | 'boss'; readonly cards: ReadonlyArray<OfferCard> }
    | null
  >(() => {
    if (simRun === null) return null;
    if (state.state.outcome !== 'in_progress') return null;
    if (state.combatActive) return null;

    // Boss first — tighter gate (round 11 + win + NEITHER boss reward taken).
    // CF-67: the offer is "pick ONE boss reward" — a relic OR the Legendary item.
    // Picking the relic sets relics.boss; picking the item sets bossRewardItemId.
    // Gating on both (not just relics.boss) dismisses the offer on the item pick
    // too, rather than relying solely on the deferred advancePhase to end the run.
    const last = state.state.history[state.state.history.length - 1];
    if (
      last !== undefined &&
      last.round === 11 &&
      last.outcome === 'win' &&
      state.state.relics.boss === null &&
      state.state.bossRewardItemId === null
    ) {
      const relicCards: OfferCard[] = generateBossRelicOffer(
        state.state.seed,
        state.state.classId,
      ).map((relicId) => ({ kind: 'relic', relicId }));
      // CF-67: append the fixed Legendary item option (balance-bible § 15).
      const cards: OfferCard[] = [
        ...relicCards,
        { kind: 'item', itemId: BOSS_REWARD_ITEM_ID },
      ];
      return { slot: 'boss', cards };
    }

    // Mid — round 6+, mid slot empty.
    if (state.state.round < 6) return null;
    if (state.state.relics.mid !== null) return null;
    const cards: OfferCard[] = generateMidRelicOffer(
      state.state.seed,
      state.state.classId,
    ).map((relicId) => ({ kind: 'relic', relicId }));
    return { slot: 'mid', cards };
  }, [
    simRun,
    state.state.outcome,
    state.combatActive,
    state.state.round,
    state.state.relics.mid,
    state.state.relics.boss,
    state.state.bossRewardItemId,
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
    // CF-77 Phase 2 PR2 (R3): a genuinely new run re-mints — null the ref so the
    // createRun effect's ensureFreshPushRunId mints a fresh push id.
    pushRunIdRef.current = null;
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
    // CF-77 Phase 2 PR2 (R3): Play Again is a NEW run — re-mint the push id.
    pushRunIdRef.current = null;
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

  // CF-77 Phase 2 PR2 (R1/R2/R4): per-round PUSH producer. DECLARED BEFORE the
  // quiescent-save effect below (R2) so the server push is wired ahead of the
  // local-save path in source order.
  //
  // Keyed on state.state.history.length — history is append-only, so its length
  // ticks EXACTLY ONCE per resolved round (applyCombatOutcome), INCLUDING the
  // terminal round (which appends to history before the outcome flip). This is
  // the correct trigger and a SEPARATE effect from the quiescent-save effect
  // (whose [round, outcome] deps false-fire on mount, lag a round, and are dead
  // on the terminal branch — R1). It reports history[last] = the just-resolved
  // round; onRoundResult / pushRunIdRef / the history entry are read via closure
  // (deliberately absent from the deps, mirroring the quiescent-save effect) so
  // only a real length change fires it. onRoundResult is a stable callback
  // (RunProvider's useCallback), so its identity never churns the effect.
  //
  // prevHistoryLenRef + the len<=prev guard make the push fire once per INCREASE
  // only: a re-fire at the same length (e.g. StrictMode's dev double-mount, or a
  // simRun-dep fire with unchanged history) does not re-push. Even if it did,
  // the SAME pushRunId (commit 2) means the server's applied_round_results
  // composite PK would absorb the duplicate.
  //
  // RESTORE REFIRE IS ALLOWED AND INTENDED (R4): on restore, history.length
  // jumps 0 -> N and this fires for the LAST restored round under the SAME
  // persisted pushRunId (read through in the restore effect). The server PK
  // absorbs it as a no-op if that round was already applied, and it doubles as
  // REPAIR if the pre-crash push never landed. NO client-side suppression guard
  // — correctness is delegated to the server idempotency record.
  const prevHistoryLenRef = useRef(0);
  useEffect(() => {
    const len = state.state.history.length;
    const prev = prevHistoryLenRef.current;
    prevHistoryLenRef.current = len;
    if (simRun === null) return;
    if (len === 0) return;
    // Fire on a length INCREASE only (a new resolved round or the restore jump).
    // reset_run drops length to 0 (and nulls simRun), so it never pushes.
    if (len <= prev) return;
    const last = state.state.history[len - 1];
    if (last === undefined) return;
    const runId = pushRunIdRef.current;
    // runId is non-null whenever a run is active (minted on create / read
    // through on restore, both BEFORE setSimRun). Guard defensively: a null id
    // means nothing was persisted to push against, so skip rather than send an
    // invalid (empty) idempotency key the server would 400.
    if (runId === null) return;
    onRoundResult?.({
      runId,
      round: last.round,
      roundOutcome: last.outcome,
    });
  }, [simRun, state.state.history.length]);

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
      // CF 43: persist recipe-born membership from the sim (sole owner of the
      // internal Set) so recipeBonusPct survives save→restore.
      bornFromRecipe: simRun.getRecipeBornPlacementIds(),
      // CF-77 Phase 2 PR2 (R3): persist the run's push id so a restore reuses it.
      // Non-null whenever a run is active (create mints / restore reads it through
      // before setSimRun); `?? undefined` keeps the field absent in the impossible
      // null case, matching the legacy-save shape.
      //
      // B.4 CRASH-WINDOW INVARIANT — do NOT let a refactor silently remove this
      // ordering: this persist is SYNCHRONOUS (saveLocal below, same effect-flush),
      // while a per-round PUSH reaches the wire only AFTER at least one await — the
      // producer effect (declared above) enqueues synchronously, then RunProvider's
      // drain awaits before the network PUT. So pushRunId is in localStorage BEFORE
      // any server-apply under it: a crash cannot land after server-apply yet before
      // persist, which would otherwise re-mint on restore and double-credit past the
      // applied_round_results composite PK. (For a fresh run it is already persisted
      // at the round-1 arranging-entry, before any round resolves.)
      pushRunId: pushRunIdRef.current ?? undefined,
    };
    // CF-74 (M2.1 PR3): READ CROSS-SESSION FIELDS THROUGH — never hardcode.
    // Pre-fix this composer wrote literal `trophies: 0, dailyStreak: 0,
    // lastDailyAttempted: null, tutorialCompleted: false` on EVERY quiescent
    // save, silently destroying any value the envelope already held. The
    // 2026-05-23 Phase-2.5g meta-audit hardened `clearLocal` to preserve
    // exactly these fields (persistence/index.ts names the risk outright:
    // "cumulative trophies resetting on every abandon") — but only the CLEAR
    // half was fixed; this COMPOSER half kept zeroing them. Latent while
    // every value was always 0; live the instant PR3 hydrates a non-zero
    // server value into the envelope.
    //
    // Scope note: CF-74 as ratified (decision-log.md 2026-07-14 § "M2.1 PR3
    // PHASE 1 RATIFIED") names three fields — trophies, dailyStreak,
    // lastDailyAttempted. `tutorialCompleted` is a FOURTH instance of the
    // identical defect (persistence/index.ts names "tutorial re-firing" in
    // the same breath). Reading it through costs nothing — excluding it
    // would take extra code to keep zeroing it — so the fix covers all four.
    // Bundled ratified deviation beyond CF-74's named three; CF-66 precedent.
    //
    // `?? default` materializes each default AT THE CONSUMPTION POINT, per
    // the CF-43 rule: the load boundary is a Zod type-GUARD returning the
    // raw object, so `.default()` output is discarded and a field absent
    // from an older envelope arrives undefined, not defaulted.
    const persisted = loadLocal();
    const payload: LocalSaveV1 = {
      schemaVersion: 1,
      trophies: persisted?.trophies ?? 0,
      dailyStreak: persisted?.dailyStreak ?? 0,
      lastDailyAttempted: persisted?.lastDailyAttempted ?? null,
      tutorialCompleted: persisted?.tutorialCompleted ?? false,
      // NOT read through: `anonId` is the stateful value resolved at mount
      // (lazy initializer reads the persisted id, else mints one). It is
      // already authoritative here — re-reading storage could only regress
      // it to a stale value.
      telemetryAnonId: anonId,
      inProgressRun: serialized,
    };
    saveLocal(payload);
    // CF-77 Phase 2 PR2 (R1/R2): the server PUSH no longer rides this
    // quiescent-save effect — it moved to a dedicated per-round PRODUCER effect
    // keyed on history.length (declared above), which fires once per resolved
    // round INCLUDING the terminal round (this effect early-returns on the
    // terminal branch before reaching here, so it could never push it). This
    // effect is now purely local persistence.
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

  // CF-67: item-branch dispatch — mirrors grantSelectedRelic but for the boss
  // reward ITEM (grantBossItem). MUST resume the deferred advancePhase: the
  // pendingRelicOffer boss branch fires while outcome is in_progress, so ending
  // the run (advancePhase → 'ended') is what dismisses the offer and finalizes
  // the win. grantBossItem also sets bossRewardItemId, which the offer gate reads
  // — belt-and-suspenders so the offer never re-shows the already-taken reward.
  const grantSelectedItem = useCallback(
    (itemId: ItemId) => {
      if (simRun === null) return;
      if (state.state.outcome !== 'in_progress') return;
      simRun.grantBossItem(itemId);
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
  // mirrors the boss branch of the pendingRelicOffer useMemo — same four
  // readings (CF-67 Codex round 2: bossRewardItemId === null joins the mirror, so
  // a restored state with the item leg already taken advances to run-end instead
  // of deferring forever with no modal); inline rather than helper (one call site).
  const onCombatDone = useCallback((payload: CombatDonePayload) => {
    if (simRun === null) return;
    if (state.state.outcome !== 'in_progress') return;
    // β disposition (Phase 2b-2 ratification): capture sim.gold before
    // bundled mutations. The reducer applies the sim-computed delta
    // (winBonus on win + baseIncomeForRound on advance, shouldEndRun-
    // guarded at sim state.ts:357-360). § 4.5 R2 strict enactment —
    // client recomputes nothing; sim is single source of truth for the
    // gold-delta math.
    // β disposition retired (CF 34 / M1.5e PR 1): sim is the sole gold writer,
    // so there is no before/after gold-capture — the sync below carries sim's
    // authoritative gold/trophy directly.
    simRun.applyCombatOutcome({
      outcome: payload.result.outcome,
      damageDealt: payload.damageDealt,
      damageTaken: payload.damageTaken,
      endedAtTick: payload.result.endedAtTick,
      endReason: payload.result.endReason,
      opponentGhostId: payload.opponentGhostId,
      opponentClassId: payload.opponentClassId,
    });
    const postApply = simRun.getState();
    const lastEntry = postApply.history[postApply.history.length - 1];
    const shouldDeferAdvance =
      lastEntry?.round === 11 &&
      lastEntry?.outcome === 'win' &&
      postApply.relics.boss === null &&
      postApply.bossRewardItemId === null;
    if (!shouldDeferAdvance) {
      simRun.advancePhase();
      // B2 Option 1: advancePhase → makeShop consumed this.rng (kept for
      // 224-fixture stability); overwrite the new round's stored slots with the
      // client's shopSeedFor items. Guard on 'arranging' — a round-end
      // advancePhase leaves phase 'ended' (no shop), and overrideShopSlots is
      // arranging-only.
      if (simRun.getPhase() === 'arranging') {
        const snap = simRun.getState();
        simRun.overrideShopSlots(
          generateShop(
            snap.seed,
            snap.currentRound,
            snap.classId,
            snap.ruleset,
            snap.shop.rerollsThisRound,
          ).map((s) => s.itemId!),
        );
      }
    }
    dispatch({ type: 'sync_from_sim', snapshot: simRun.getState() });
    dispatch({ type: 'combat_done' });
  }, [simRun, state.state.outcome]);

  return {
    state,
    simRun,
    pendingRunInput,
    beginRun,
    recipes,
    scoutedRecipes,
    combineRejection,
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
    grantSelectedItem,
    resetRun,
    replaySameClass,
    abandonRun,
  };
}
