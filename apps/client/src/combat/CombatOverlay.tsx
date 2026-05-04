// Real combat playback overlay (M1.3.4a §4 + M1.3.4b render-layer swap).
// Sim wiring is unchanged from M1.3.4a:
//   - simulateCombat runs once at mount via the combat-side bridge.
//   - HP arithmetic remains sim-authoritative (event payloads' remainingHp /
//     newHp / finalHp).
//   - CombatDonePayload (damageDealt / damageTaken / opponentGhostId)
//     pre-computed against initialPlayerHp / initialGhostHp − finalHp,
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

import { useEffect, useMemo, useRef, useState } from 'react';
import type Phaser from 'phaser';
import {
  TICKS_PER_SECOND,
  type CombatInput,
  type CombatResult,
  type GhostId,
} from '@packbreaker/content';
import { useRunContext } from '../run/RunContext';
import type { CombatDonePayload } from '../run/useRun';
import { clientBagToSimBag, emptyRelicSlots } from '../run/sim-bridge';
import { runCombat } from './sim-bridge.combat';
import { CombatScene, createCombatGame } from './CombatScene';
import { RoundResolution } from '../screens/RoundResolution';
import { makeGhostForRound } from './ghost';

// Player class is the M1 prototype Tinker — visible in the portrait
// label. Real class-select screen (gdd.md § 14 screen #2) is M1.5+.
const M1_PROTOTYPE_CLASS_LABEL = 'Tinker';
// Phaser RESIZE mode adapts to the actual parent size after the first
// layout tick; createCombatGame falls back to safe non-zero defaults
// inside the game config if measurement isn't ready at construction.

interface CombatOverlayProps {
  active: boolean;
  onDone: (payload: CombatDonePayload) => void;
}

/** Builds a CombatInput from current run state. Pure construction —
 *  no rng, no side effects. */
function buildCombatInput(
  bag: ReturnType<typeof useRunContext>['state']['bag'],
  state: ReturnType<typeof useRunContext>['state']['state'],
): { input: CombatInput; ghostClass: string; ghostId: GhostId } {
  const playerBag = clientBagToSimBag(bag, state.ruleset.bagDimensions);
  const ghost = makeGhostForRound(state.seed, state.round, state.ruleset.bagDimensions);
  const input: CombatInput = {
    seed: state.seed,
    player: {
      bag: playerBag,
      relics: emptyRelicSlots(),
      classId: 'tinker' as CombatInput['player']['classId'],
      // M1.3.4a: maxHpBonus / class-driven HP / boss overrides land in
      // M1.5 alongside relic state. For now, base HP only.
      startingHp: 30,
    },
    ghost: ghost.combatant,
  };
  return { input, ghostClass: titleCase(ghost.classId), ghostId: ghost.id };
}

function titleCase(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function CombatOverlay({ active, onDone }: CombatOverlayProps) {
  const ctx = useRunContext();

  // Compute the combat result + initial HPs once at mount. Memoize
  // against (active, round, seed, bag) so the result is stable across
  // renders within a single combat.
  const { result, initialPlayerHp, initialGhostHp, ghostClassLabel, ghostId } = useMemo(() => {
    if (!active) {
      return {
        result: null as CombatResult | null,
        initialPlayerHp: 0,
        initialGhostHp: 0,
        ghostClassLabel: 'Marauder',
        ghostId: null as GhostId | null,
      };
    }
    const { input, ghostClass, ghostId: gid } = buildCombatInput(ctx.state.bag, ctx.state.state);
    const r = runCombat(input);
    return {
      result: r,
      initialPlayerHp: input.player.startingHp,
      initialGhostHp: input.ghost.startingHp,
      ghostClassLabel: ghostClass,
      ghostId: gid,
    };
  }, [active, ctx.state.state.round, ctx.state.state.seed, ctx.state.bag]);

  const [phase, setPhase] = useState<'combat' | 'resolved'>('combat');
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
      game = createCombatGame(container, {
        events: result.events,
        endedAtTick: result.endedAtTick,
        initialPlayerHp,
        initialGhostHp,
        ticksPerSecond: TICKS_PER_SECOND,
        ghostClassLabel,
        playerClassLabel: M1_PROTOTYPE_CLASS_LABEL,
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
  }, [active, result, initialPlayerHp, initialGhostHp, ghostClassLabel, phase]);

  // Damage attributable to player / ghost. result.finalHp is HP at the
  // tick the simulation ended (KO or MAX_COMBAT_TICKS). Clamp to ≥0 so
  // status-tick lethal hits don't underflow if HP went negative inside
  // sim before being clamped at the event boundary.
  const damageDealt = result ? Math.max(0, initialGhostHp - result.finalHp.ghost) : 0;
  const damageTaken = result ? Math.max(0, initialPlayerHp - result.finalHp.player) : 0;
  const isWin = result?.outcome === 'player_win';
  const ruleset = ctx.state.state.ruleset;
  const goldEarned = isWin ? ruleset.winBonusGold : 0;
  const trophyEarned = isWin ? 18 : 0;

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
          outcome={isWin ? 'win' : 'loss'}
          damageDealt={damageDealt}
          damageTaken={damageTaken}
          goldEarned={goldEarned}
          trophyEarned={trophyEarned}
          hearts={heartsPost}
          maxHearts={ctx.state.state.maxHearts}
          onNext={handleNext}
        />
      )}
    </div>
  );
}
