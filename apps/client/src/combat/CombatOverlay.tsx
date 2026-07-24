// Real combat playback overlay (M1.3.4a §4 + M1.3.4b render-layer swap).
// Sim wiring is unchanged from M1.3.4a:
//   - simulateCombat runs once at mount via the combat-side bridge.
//   - HP arithmetic remains sim-authoritative (event payloads' remainingHp /
//     newHp / finalHp).
//   - CombatDonePayload (damageDealt / damageTaken / opponentGhostId)
//     computed via the sim's shared computeDamageStats (gross item damage,
//     CF-83 ramp-excluded — the same definition round_end telemetry uses),
//     then forwarded to the reducer's combat_done.
//
// What changed at M1.3.4b: the DOM Portrait + HP-bar tree (and its 3
// character-art hex sites) is gone. CombatScene.ts owns the render
// surface — Phaser canvas, transparent, one scene, geometric particles,
// stock Quartic.Out easing as the documented approximation of the
// locked cubic-bezier(0.16, 1, 0.3, 1). React still owns the
// orchestrator state, the SKIP button (DOM, accessible), and the
// RoundResolution handoff.
//
// Lazy-load discipline: this module loads via combat/LazyCombatOverlay
// (React.lazy + Suspense at the dispatcher level), so Phaser ships
// exclusively in the combat chunk per Vite chunk-splitting. Sim's
// combat-only subgraph (combat.ts / status.ts / triggers.ts) rides
// the same chunk via the M1.3.4a step 6 sim-bridge split.

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type Phaser from 'phaser';
import {
  TICKS_PER_SECOND,
  type ClassId,
  type CombatEvent,
  type CombatInput,
  type CombatResult,
  type ContractMutator,
  type GhostId,
  type PlacementId,
} from '@packbreaker/content';
import { useRunContext } from '../run/RunContext';
import type { CombatDonePayload } from '../run/useRun';
import type { BagItem } from '../run/types';
import { clientBagToSimBag, simBagToClientBag } from '../run/sim-bridge';
import { computeDamageStats, trophyDeltaFor } from '@packbreaker/sim';
import { buildEventAttribution } from './attribution';
import { runCombat } from './sim-bridge.combat';
import {
  CombatScene,
  createCombatGame,
  PORTRAIT_X_RATIO_GHOST,
  PORTRAIT_X_RATIO_PLAYER,
  PORTRAIT_Y_RATIO,
} from './CombatScene';
import { computeBagLayout } from '../bag/layout';
import { useCellSize } from '../bag/CellSize';
import { RoundResolution } from '../screens/RoundResolution';
import { opponentForRound } from './opponentForRound';

// Event types that mean "the player needs to see this combat play out."
// Used by the option-2 zero-content fast-skip predicate. Codex P1 fix on
// PR #7 (decision-log 2026-05-04 amendment): the previous predicate
// (`damageDealt === 0 && damageTaken === 0`) matched any combat that
// netted to zero HP delta on both sides — e.g., damage offset by
// healing, mutual-burn stalemates, shield-wall stalemates — and would
// have skipped Phaser playback despite real events the player needed
// to see. Switching the check to event-content protects against that.
//
// `recipe_combine` is intentionally absent: it is not a member of the
// CombatEvent union (sim doesn't emit; CF 4b open, deferred until M2
// content sweep). `combat_start` / `combat_end` are also absent as
// universal (every combat emits one of each, so they're uninformative
// for the "is this combat worth mounting Phaser for" predicate). Net
// coverage: 8 of 10 CombatEvent['type'] members, post-M1.4b2.3 lockstep
// with the new render paths in CombatScene.playEventVisuals.
const MEANINGFUL_EVENT_TYPES: ReadonlySet<CombatEvent['type']> = new Set([
  'damage',
  'heal',
  'status_apply',
  'status_tick',
  'item_trigger',
  'stun_consumed',
  'buff_apply',
  'buff_remove',
  // CF-83 (decision-log.md 2026-07-19 § "CF-83 RAMP + CF-84 DRAW SEMANTICS
  // RATIFIED", item 6): a ramp-only mutual-KO draw must NOT hit the zero-content
  // fast-skip, or the CF-84 legibility fix is bypassed on exactly the population
  // it renders honestly. 9 of 11 CombatEvent['type'] members now meaningful.
  'ramp_tick',
]);
// Phaser RESIZE mode adapts to the actual parent size after the first
// layout tick; createCombatGame falls back to safe non-zero defaults
// inside the game config if measurement isn't ready at construction.

interface CombatOverlayProps {
  active: boolean;
  onDone: (payload: CombatDonePayload) => void;
  /** Ref to the player bag's grid div, populated by BagBoard via the
   *  `containerRef` prop in DesktopRunScreen / MobileRunScreen. Read at
   *  combat-phase entry to measure screen-space origin for the M1.4a
   *  BagLayout handshake. */
  bagContainerRef: RefObject<HTMLDivElement>;
}

/** Builds a CombatInput from current run state. Pure construction —
 *  no rng, no side effects. */
export function buildCombatInput(
  bag: ReturnType<typeof useRunContext>['state']['bag'],
  state: ReturnType<typeof useRunContext>['state']['state'],
  player: { startingHp: number; recipeBornPlacementIds: ReadonlyArray<PlacementId> },
): {
  input: CombatInput;
  ghostClass: string;
  ghostId: GhostId;
  ghostClassId: ClassId;
  mutators: ReadonlyArray<ContractMutator>;
} {
  const playerBag = clientBagToSimBag(bag, state.ruleset.bagDimensions);
  // CF-87 route (D): ONE shared chokepoint picks the round's opponent — the
  // procedural ghost for rounds 1–10, the § 15 Forge Tyrant at round 11 — and
  // hands back the mutators the fight forwards to the sim. This is the SAME call
  // ghostIntentForRound makes, so the intent panel and the fight stay one
  // derivation (decision-log.md 2026-07-24 § "CF-87 PHASE 1 RATIFIED …" §§ 4, 8).
  const opponent = opponentForRound(state.seed, state.round, state.ruleset.bagDimensions);
  const input: CombatInput = {
    seed: state.seed,
    player: {
      bag: playerBag,
      // M1.5b PR 1 Phase 2.5 (Codex P1 fix on PR 16 ea2a4b0): classId
      // and relics come from sim-authoritative state.classId /
      // state.relics (mirrored by applySimSnapshot). Pre-fix the
      // M1.3.4a prototype hardcoded `'tinker'` + `emptyRelicSlots()`,
      // so Marauder runs played as Tinker and starter-relic combat
      // effects (Razor's Edge, Bloodfont, Iron Will, etc.) silently
      // no-opped.
      relics: state.relics,
      classId: state.classId,
      // Sim-authoritative (tech-architecture.md § 4.5 Rule 2): startingHp
      // from RunController.getPlayerStartingHp() (BASE_COMBATANT_HP + bag
      // maxHpBonus sum) and recipeBornPlacementIds from
      // getRecipeBornPlacementIds() (the sim's bornFromRecipe set —
      // populated by combineRecipe, pruned on sell/consume, rehydrated on
      // restore). Threaded in from the memo call site. Closes CF 63
      // (recipe-bonus threading — live: reachable iconned recipes drop
      // Tinker's recipeBonusPct today) + CF 42 (startingHp hardcode —
      // latent hardening: no maxHpBonus item is reachable in the iconned
      // content set today, so this is correct now and future-proofed).
      startingHp: player.startingHp,
      recipeBornPlacementIds: player.recipeBornPlacementIds,
    },
    ghost: opponent.combatant,
  };
  return {
    input,
    // "Forge Tyrant" at round 11, else the class display name. Feeds the
    // CombatScene ghost portrait AND the RoundResolution S2b reveal label,
    // both of which read this single string.
    ghostClass: opponent.displayLabel,
    ghostId: opponent.ghostId,
    ghostClassId: opponent.classId,
    mutators: opponent.mutators,
  };
}

export function CombatOverlay({ active, onDone, bagContainerRef }: CombatOverlayProps) {
  const ctx = useRunContext();
  const cellSize = useCellSize();

  // Compute the combat result + initial HPs once at mount. Memoize
  // against (active, round, seed, bag) so the result is stable across
  // renders within a single combat. Captures the bag snapshot + bag
  // dimensions used at simulation time so the M1.4a BagLayout
  // handshake measures against the same state the sim consumed.
  const { result, initialPlayerHp, initialGhostHp, ghostClassLabel, ghostId, ghostClassId, bagSnapshot, bagDimensions, ghostBagItems, eventLabels } =
    useMemo(() => {
      if (!active || ctx.simRun === null) {
        return {
          result: null as CombatResult | null,
          initialPlayerHp: 0,
          initialGhostHp: 0,
          ghostClassLabel: 'Marauder',
          ghostId: null as GhostId | null,
          ghostClassId: null as ClassId | null,
          bagSnapshot: ctx.state.bag,
          bagDimensions: ctx.state.state.ruleset.bagDimensions,
          ghostBagItems: [] as BagItem[],
          eventLabels: [] as ReadonlyArray<string | null>,
        };
      }
      const { input, ghostClass, ghostId: gid, ghostClassId: gcid, mutators } = buildCombatInput(
        ctx.state.bag,
        ctx.state.state,
        {
          startingHp: ctx.simRun.getPlayerStartingHp(),
          recipeBornPlacementIds: ctx.simRun.getRecipeBornPlacementIds(),
        },
      );
      // CF-87 route (D): forward the round's mutators (boss_only at round 11,
      // empty otherwise). Empty list → sim short-circuits → unchanged combat.
      const r = runCombat(input, mutators);
      // CF-85 Surface 2b: retain the ghost placements the sim actually
      // fought with (previously discarded post-memo) — client shape via
      // the existing simBagToClientBag adapter, consumed by the
      // RoundResolution opponent-build reveal.
      const ghostBag = simBagToClientBag(input.ghost.bag);
      // CF-85 Surface 1: index-aligned item-attribution labels for the
      // event stream (pure module; the scene renders them verbatim).
      // Player index = the same bag snapshot the sim consumed.
      const labels = buildEventAttribution(r.events, ctx.state.bag, ghostBag);
      return {
        result: r,
        initialPlayerHp: input.player.startingHp,
        initialGhostHp: input.ghost.startingHp,
        ghostClassLabel: ghostClass,
        ghostId: gid,
        ghostClassId: gcid as ClassId | null,
        bagSnapshot: ctx.state.bag,
        bagDimensions: ctx.state.state.ruleset.bagDimensions,
        ghostBagItems: ghostBag,
        eventLabels: labels,
      };
    }, [active, ctx.simRun, ctx.state.state.round, ctx.state.state.seed, ctx.state.bag, ctx.state.state.ruleset.bagDimensions]);

  // Damage attributable to player / ghost. CF-83 Fix A: use the sim's
  // shared computeDamageStats — gross item + status damage summed from the
  // event stream — the SAME definition round_end telemetry uses, so display
  // and telemetry can't disagree. This excludes the source-less CF-83 ramp
  // drain (a `ramp_tick`, not a damage event), so a ramp-resolved draw
  // honestly reports 0 / 0; it also reports gross (pre-heal) damage rather
  // than the old net-of-heal `finalHp` delta.
  const { damageDealt, damageTaken } = result
    ? computeDamageStats(result.events)
    : { damageDealt: 0, damageTaken: 0 };

  // Zero-content fast-skip — see decision-log 2026-05-04 + the Codex P1
  // amendment block in the same entry. Predicate checks event CONTENT,
  // not net HP deltas, so combats that net to zero HP on both sides via
  // offsetting damage + healing (or any other meaningful event sequence)
  // still mount Phaser. The `outcome === 'draw'` guard stays — a non-
  // draw with no meaningful events would be a sim bug worth surfacing
  // rather than silently bypassing. Reducer + telemetry path is
  // unchanged (combat_done still dispatches on NEXT click via
  // handleNext).
  const hasNoMeaningfulEvents =
    result !== null && !result.events.some((e) => MEANINGFUL_EVENT_TYPES.has(e.type));
  const isZeroContent =
    result !== null && hasNoMeaningfulEvents && result.outcome === 'draw';

  const [phase, setPhase] = useState<'combat' | 'resolved'>(
    isZeroContent ? 'resolved' : 'combat',
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  // Phaser game lifecycle — create when (active && result) becomes true,
  // destroy on unmount or when the result changes (next-round combat).
  // The async start path waits on document.fonts.ready so the first
  // floater never falls back to system font (Inter is loaded via the
  // index.html @font-face declaration).
  useEffect(() => {
    if (!active || !result || phase !== 'combat') return;
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let game: Phaser.Game | null = null;

    const start = async () => {
      if (typeof document !== 'undefined' && 'fonts' in document) {
        try {
          await document.fonts.ready;
        } catch {
          /* noop — fall through to scene start regardless */
        }
      }
      if (cancelled) return;

      // M1.4a BagLayout handshake — measure DOM positions in
      // screen-space and pack into a BagLayout. § 4.5 R2: portrait
      // anchors derive from CombatScene's PORTRAIT_*_RATIO consts so
      // orchestrator and scene measure against the same authority.
      // Static for the duration of combat per tech-architecture.md § 2.
      const bagRect = bagContainerRef.current?.getBoundingClientRect();
      const canvasRect = container.getBoundingClientRect();
      const bagLayout = computeBagLayout({
        playerBagItems: bagSnapshot,
        cellSize,
        playerBagOriginPx: { x: bagRect?.left ?? 0, y: bagRect?.top ?? 0 },
        dimensions: bagDimensions,
        playerPortraitAnchor: {
          x: canvasRect.left + canvasRect.width * PORTRAIT_X_RATIO_PLAYER,
          y: canvasRect.top + canvasRect.height * PORTRAIT_Y_RATIO,
        },
        ghostPortraitAnchor: {
          x: canvasRect.left + canvasRect.width * PORTRAIT_X_RATIO_GHOST,
          y: canvasRect.top + canvasRect.height * PORTRAIT_Y_RATIO,
        },
      });

      game = createCombatGame(container, {
        events: result.events,
        endedAtTick: result.endedAtTick,
        initialPlayerHp,
        initialGhostHp,
        ticksPerSecond: TICKS_PER_SECOND,
        ghostClassLabel,
        playerClassLabel: ctx.state.state.className,
        bagLayout,
        // CF-85 Surface 1: index-aligned attribution labels (pure module
        // output; the scene renders them verbatim, no lookup of its own).
        eventLabels,
        onCombatEnd: () => setPhase('resolved'),
      });
      gameRef.current = game;
    };
    void start();

    return () => {
      cancelled = true;
      // Phaser.Game.destroy(removeCanvas, noReturn). We want the canvas
      // gone too so React's container div is empty after unmount.
      if (game) game.destroy(true);
      else if (gameRef.current) gameRef.current.destroy(true);
      gameRef.current = null;
    };
  }, [active, result, initialPlayerHp, initialGhostHp, ghostClassLabel, ctx.state.state.className, phase, bagSnapshot, bagDimensions, cellSize, bagContainerRef, eventLabels]);

  const isWin = result?.outcome === 'player_win';
  // CF-84: honest 3-way DISPLAY outcome (player_win → win, ghost_win → loss, draw
  // → draw). The ECONOMY below (goldEarned / trophyEarned / heartsPost) still
  // collapses a draw to 'loss' — a draw costs 1 heart + the clamped trophy delta,
  // unchanged (item 7). Only the render label changes: stop showing a draw as LOST.
  const displayOutcome: 'win' | 'loss' | 'draw' =
    result?.outcome === 'player_win'
      ? 'win'
      : result?.outcome === 'draw'
        ? 'draw'
        : 'loss';
  const ruleset = ctx.state.state.ruleset;
  const goldEarned = isWin ? ruleset.winBonusGold : 0;
  // CF-38 antidote (trophy axis): call the sim's canonical award derivation
  // instead of re-stating its arithmetic as a literal here. The old
  // `isWin ? 18 : 0` agreed with the sim only because both were the same M0
  // placeholder — a coincidence CF-72's schedule would have broken.
  //
  // Load-bearing render-order invariant: this reads at phase === 'resolved',
  // which paints strictly BEFORE handleNext → onDone → onCombatDone →
  // applyCombatOutcome commits. So ctx.state.state.trophy is still the
  // PRE-combat value — the same input the sim will read when it applies the
  // delta — and the panel's number matches the mutation exactly, including the
  // loss floor-clamp edge. Asserted directly in CombatOverlay.test.tsx rather
  // than left to render-order coincidence.
  const trophyEarned = trophyDeltaFor(
    isWin ? 'win' : 'loss',
    ctx.state.state.round,
    ctx.state.state.trophy,
  );

  function handleSkip() {
    const scene = gameRef.current?.scene.getScene(CombatScene.KEY) as
      | CombatScene
      | undefined;
    scene?.skipToEnd();
  }

  function handleNext() {
    if (result) {
      onDone({
        result,
        opponentGhostId: ghostId,
        opponentClassId: ghostClassId,
        damageDealt,
        damageTaken,
      });
    }
  }

  if (!active) return null;

  // Hearts shown in the resolution panel are post-loss values: hearts go
  // from current → current-1 on a loss (clamped to 0). The reducer
  // applies the same delta when combat_done dispatches; we render the
  // post-state here so the player sees the cost before pressing NEXT.
  const heartsPost = isWin
    ? ctx.state.state.hearts
    : Math.max(0, ctx.state.state.hearts - 1);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(11,15,26,0.78)', zIndex: 50, backdropFilter: 'blur(2px)' }}
    >
      {phase === 'combat' && result && (
        <>
          <div
            ref={containerRef}
            data-testid="combat-canvas-container"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          />
          <button
            type="button"
            onClick={handleSkip}
            data-testid="combat-skip"
            className="absolute label-cap ease-snap hover-lift"
            style={{
              right: 16,
              bottom: 16,
              padding: '8px 14px',
              borderRadius: 6,
              background: 'var(--surface-elev)',
              color: 'var(--text-primary)',
              fontSize: 11,
              letterSpacing: '0.08em',
              border: '1px solid var(--text-secondary)',
              cursor: 'pointer',
              zIndex: 1,
            }}
          >
            SKIP →
          </button>
        </>
      )}
      {phase === 'resolved' && result && (
        <RoundResolution
          round={ctx.state.state.round}
          outcome={displayOutcome}
          damageDealt={damageDealt}
          damageTaken={damageTaken}
          goldEarned={goldEarned}
          trophyEarned={trophyEarned}
          hearts={heartsPost}
          maxHearts={ctx.state.state.maxHearts}
          onNext={handleNext}
          // CF-85 Surface 2b: the ghost build this combat ACTUALLY fought
          // (post-combat reveal — gdd.md §14's pre-combat restriction N/A).
          opponentBuild={{ classLabel: ghostClassLabel, bagItems: ghostBagItems }}
        />
      )}
    </div>
  );
}
