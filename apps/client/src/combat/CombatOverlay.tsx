// Real combat playback overlay (M1.3.4a §4). Replaces the M1.3.1
// canned 4-second SCRIPT with sim-driven CombatResult playback at
// TICKS_PER_SECOND = 10 (100ms per tick). The ghost is generated
// procedurally per round (combat/ghost.ts) and the player Combatant is
// constructed from runState.bag at combat-start.
//
// Lazy-loaded via combat/LazyCombatOverlay.tsx so that the simulateCombat
// dependency (and its transitive sim modules) only enter the bundle as
// the combat chunk — main never parses combat code. tech-architecture.md
// § 10 mandates: title screen ships React + bag UI only.
//
// Phaser-based VFX scene replaces this overlay's portrait/HP-bar
// rendering in M1.3.4b. Until then, plain DOM + CSS keep the combat
// readable for screenshots and screenreaders alike.

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  TICKS_PER_SECOND,
  type CombatInput,
  type CombatResult,
  type EntityRef,
} from '@packbreaker/content';
import { BurnGlyph } from '../icons/icons';
import { useRunContext } from '../run/RunContext';
import { clientBagToSimBag, emptyRelicSlots, runCombat } from '../run/sim-bridge';
import { RoundResolution } from '../screens/RoundResolution';
import { makeGhostForRound } from './ghost';

const MS_PER_TICK = Math.round(1000 / TICKS_PER_SECOND); // 100
// How long damage / heal numbers stay on screen after their tick fires
// (in real ms, not ticks). Tuned to match the prototype's ≈1.1s.
const FLOATER_LIFETIME_MS = 1100;
// Player class is the M1 prototype Tinker — visible in the portrait
// label. Real class-select screen (gdd.md § 14 screen #2) is M1.5+.
const M1_PROTOTYPE_CLASS_LABEL = 'Tinker';

interface CombatOverlayProps {
  active: boolean;
  onDone: (result: CombatResult) => void;
}

/** Builds a CombatInput from current run state. Pure construction —
 *  no rng, no side effects. */
function buildCombatInput(
  bag: ReturnType<typeof useRunContext>['state']['bag'],
  state: ReturnType<typeof useRunContext>['state']['state'],
): { input: CombatInput; ghostClass: string } {
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
  return { input, ghostClass: titleCase(ghost.classId) };
}

function titleCase(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

interface DisplayedFloater {
  readonly id: number;
  readonly side: EntityRef;
  readonly kind: 'damage' | 'heal' | 'status_tick' | 'ko';
  readonly amount?: number;
}

export function CombatOverlay({ active, onDone }: CombatOverlayProps) {
  const ctx = useRunContext();

  // Compute the combat result + initial HPs once at mount. Key on the
  // active flag so each combat-start re-runs the sim. Memoize against
  // bag + state.round + state.seed to keep the result stable across
  // renders within a single combat.
  const { result, initialPlayerHp, initialGhostHp, ghostClassLabel } = useMemo(() => {
    if (!active) {
      return {
        result: null as CombatResult | null,
        initialPlayerHp: 0,
        initialGhostHp: 0,
        ghostClassLabel: 'Marauder',
      };
    }
    const { input, ghostClass } = buildCombatInput(ctx.state.bag, ctx.state.state);
    const r = runCombat(input);
    return {
      result: r,
      initialPlayerHp: input.player.startingHp,
      initialGhostHp: input.ghost.startingHp,
      ghostClassLabel: ghostClass,
    };
    // Intentional narrow dep list: combat is reconstructed on combat
    // start (active false → true) and on round/seed change. Bag /
    // gold / hearts mutations during a single combat are explicitly
    // ignored — the sim runs against the bag snapshot at combat-start.
  }, [active, ctx.state.state.round, ctx.state.state.seed, ctx.state.bag]);

  // Tick scheduler: advances `currentTick` at MS_PER_TICK cadence until
  // it reaches result.endedAtTick + 1 (so the combat_end event becomes
  // visible). SKIP fast-forwards by snapping currentTick past the end.
  const [currentTick, setCurrentTick] = useState(0);
  const [phase, setPhase] = useState<'combat' | 'resolved'>('combat');
  const idRef = useRef(0);
  const [floaters, setFloaters] = useState<DisplayedFloater[]>([]);
  const handledTickRef = useRef(-1);

  useEffect(() => {
    if (!active || !result) {
      setCurrentTick(0);
      setPhase('combat');
      setFloaters([]);
      handledTickRef.current = -1;
      return;
    }
    setCurrentTick(0);
    setPhase('combat');
    setFloaters([]);
    handledTickRef.current = -1;

    const interval = setInterval(() => {
      setCurrentTick((t) => {
        const next = t + 1;
        // Resolve when we've ticked one past the combat_end tick so the
        // final-frame floaters stay on screen for a moment.
        if (next > result.endedAtTick + 1) {
          clearInterval(interval);
          return t;
        }
        return next;
      });
    }, MS_PER_TICK);

    return () => clearInterval(interval);
  }, [active, result]);

  // Side-effect: when currentTick advances past a tick we haven't seen
  // yet, materialize floaters for any damage/heal/status_tick/combat_end
  // events at that tick. handledTickRef gates against double-firing
  // when StrictMode double-renders.
  useEffect(() => {
    if (!result) return;
    if (currentTick <= handledTickRef.current) return;
    const nextHandled = currentTick;
    const newFloaters: DisplayedFloater[] = [];
    let resolvedAtTick: number | null = null;
    for (const ev of result.events) {
      if (ev.tick > currentTick) break;
      if (ev.tick <= handledTickRef.current) continue;
      if (ev.type === 'damage') {
        newFloaters.push({
          id: ++idRef.current,
          side: ev.target,
          kind: 'damage',
          amount: ev.amount,
        });
      } else if (ev.type === 'heal') {
        newFloaters.push({
          id: ++idRef.current,
          side: ev.target,
          kind: 'heal',
          amount: ev.amount,
        });
      } else if (ev.type === 'status_tick') {
        newFloaters.push({
          id: ++idRef.current,
          side: ev.target,
          kind: 'status_tick',
          amount: ev.damage,
        });
      } else if (ev.type === 'combat_end') {
        const koSide: EntityRef = ev.outcome === 'player_win' ? 'ghost' : 'player';
        newFloaters.push({
          id: ++idRef.current,
          side: koSide,
          kind: 'ko',
        });
        resolvedAtTick = ev.tick;
      }
    }
    handledTickRef.current = nextHandled;
    if (newFloaters.length > 0) {
      setFloaters((prev) => [...prev, ...newFloaters]);
      newFloaters.forEach((f) => {
        const id = f.id;
        setTimeout(
          () => setFloaters((prev) => prev.filter((x) => x.id !== id)),
          FLOATER_LIFETIME_MS,
        );
      });
    }
    if (resolvedAtTick !== null) {
      // Brief settle delay (one tick) so the KO flash shows before the
      // resolution panel takes over.
      setTimeout(() => setPhase('resolved'), MS_PER_TICK * 4);
    }
  }, [currentTick, result]);

  // Derive current HP from events ≤ currentTick. Walk only the latest
  // remainingHp/newHp value per side (events expose authoritative HPs).
  const { playerHp, ghostHp, statusStacks } = useMemo(() => {
    let pHp = initialPlayerHp;
    let gHp = initialGhostHp;
    const status = {
      player: { burn: 0, poison: 0, stun: 0 },
      ghost: { burn: 0, poison: 0, stun: 0 },
    };
    if (!result) return { playerHp: pHp, ghostHp: gHp, statusStacks: status };
    for (const ev of result.events) {
      if (ev.tick > currentTick) break;
      if (ev.type === 'damage') {
        if (ev.target === 'player') pHp = ev.remainingHp;
        else gHp = ev.remainingHp;
      } else if (ev.type === 'heal') {
        if (ev.target === 'player') pHp = ev.newHp;
        else gHp = ev.newHp;
      } else if (ev.type === 'status_tick') {
        if (ev.target === 'player') pHp = ev.remainingHp;
        else gHp = ev.remainingHp;
      } else if (ev.type === 'status_apply') {
        // status_apply carries the side's NEW total stacks (post-add per
        // status.ts § applyStatus). We snapshot the latest value rather
        // than accumulating since cap-clamping happens in the sim.
        status[ev.target][ev.status] = ev.stacks;
      }
    }
    return { playerHp: pHp, ghostHp: gHp, statusStacks: status };
  }, [result, currentTick, initialPlayerHp, initialGhostHp]);

  function handleSkip() {
    if (!result) return;
    setCurrentTick(result.endedAtTick + 2);
    setPhase('resolved');
  }

  function handleNext() {
    if (result) onDone(result);
  }

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(11,15,26,0.78)', zIndex: 50, backdropFilter: 'blur(2px)' }}
    >
      {phase === 'combat' && result && (
        <CombatStage
          floaters={floaters}
          playerHp={playerHp}
          ghostHp={ghostHp}
          maxPlayerHp={initialPlayerHp}
          maxGhostHp={initialGhostHp}
          ghostClassLabel={ghostClassLabel}
          burnPlayer={statusStacks.player.burn}
          burnGhost={statusStacks.ghost.burn}
          onSkip={handleSkip}
        />
      )}
      {phase === 'resolved' && result && <RoundResolution onNext={handleNext} />}
    </div>
  );
}

interface CombatStageProps {
  floaters: ReadonlyArray<DisplayedFloater>;
  playerHp: number;
  ghostHp: number;
  maxPlayerHp: number;
  maxGhostHp: number;
  ghostClassLabel: string;
  burnPlayer: number;
  burnGhost: number;
  onSkip: () => void;
}

function CombatStage({
  floaters,
  playerHp,
  ghostHp,
  maxPlayerHp,
  maxGhostHp,
  ghostClassLabel,
  burnPlayer,
  burnGhost,
  onSkip,
}: CombatStageProps) {
  const sideX: Record<EntityRef, string> = { player: '25%', ghost: '75%' };

  return (
    <div className="relative" style={{ width: '100%', height: '100%' }}>
      <Portrait
        side="player"
        label="YOU"
        cls={M1_PROTOTYPE_CLASS_LABEL}
        hp={playerHp}
        maxHp={maxPlayerHp}
        burnStacks={burnPlayer}
      />
      <Portrait
        side="ghost"
        label="GHOST"
        cls={ghostClassLabel}
        hp={ghostHp}
        maxHp={maxGhostHp}
        burnStacks={burnGhost}
      />
      {floaters.map((f) => {
        if (f.kind === 'ko') {
          return (
            <div
              key={f.id}
              className="absolute hit-flash"
              style={{
                left: sideX[f.side],
                top: '50%',
                transform: 'translate(-50%,-50%)',
                width: 200,
                height: 200,
                borderRadius: 8,
                background: 'radial-gradient(circle, rgba(239,68,68,0.65), transparent 70%)',
              }}
            />
          );
        }
        const isHeal = f.kind === 'heal';
        const isStatus = f.kind === 'status_tick';
        const x = sideX[f.side];
        // Heal uses --r-uncommon (closest in-palette green); status_tick
        // (burn/poison) uses --r-legendary (amber); damage uses
        // --life-stroke. Replaced in M1.3.4b by Phaser combat scene VFX.
        const color = isHeal
          ? 'var(--r-uncommon)'
          : isStatus
            ? 'var(--r-legendary)'
            : 'var(--life-stroke)';
        const sign = isHeal ? '+' : '−';
        return (
          <Fragment key={f.id}>
            <div
              className="absolute hit-flash"
              style={{
                left: x,
                top: '50%',
                transform: 'translate(-50%,-50%)',
                width: 110,
                height: 110,
                borderRadius: 8,
                background: isHeal
                  ? 'radial-gradient(circle, rgba(34,197,94,0.6), transparent 70%)'
                  : isStatus
                    ? 'radial-gradient(circle, rgba(245,158,11,0.6), transparent 70%)'
                    : 'radial-gradient(circle, rgba(239,68,68,0.55), transparent 70%)',
              }}
            />
            <div
              className="absolute dmg-rise tnum heading-tight"
              style={{
                left: x,
                top: 'calc(50% - 64px)',
                transform: 'translateX(-50%)',
                fontSize: 28,
                color,
                textShadow: '0 2px 6px rgba(0,0,0,0.7)',
              }}
            >
              {sign}
              {f.amount ?? ''}
            </div>
          </Fragment>
        );
      })}
      <div
        className="absolute label-cap"
        style={{
          left: '50%',
          top: 24,
          transform: 'translateX(-50%)',
          color: 'var(--text-secondary)',
          fontSize: 11,
          letterSpacing: '0.2em',
        }}
      >
        — COMBAT —
      </div>
      <button
        type="button"
        onClick={onSkip}
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
        }}
      >
        SKIP →
      </button>
    </div>
  );
}

interface PortraitProps {
  side: EntityRef;
  label: string;
  cls: string;
  hp: number;
  maxHp: number;
  burnStacks?: number;
}

function Portrait({ side, label, cls, hp, maxHp, burnStacks = 0 }: PortraitProps) {
  const isPlayer = side === 'player';
  const hpPct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  return (
    <div
      className="absolute"
      style={{
        left: isPlayer ? 'calc(25% - 90px)' : 'calc(75% - 90px)',
        top: 'calc(50% - 90px)',
        width: 180,
        height: 180,
      }}
    >
      <div
        className="ease-snap"
        style={{
          width: '100%',
          height: '100%',
          borderRadius: 10,
          border: `2px solid ${isPlayer ? 'var(--accent)' : 'var(--text-secondary)'}`,
          background: 'var(--surface)',
          // Inset glow uses fixed alpha-modified hex; the colors are
          // accent/text-secondary derivatives. M1.3.4b Phaser combat
          // scene replaces the placeholder portraits.
          boxShadow: `inset 0 0 30px ${isPlayer ? '#3B82F633' : '#94A3B833'}`,
          position: 'relative',
        }}
      >
        <svg viewBox="0 0 64 64" width="100%" height="100%">
          <circle
            cx="32"
            cy="22"
            r="10"
            fill={isPlayer ? 'var(--accent)' : '#475569'}
            stroke="var(--bg-deep)"
            strokeWidth="1.5"
          />
          <path
            d={
              isPlayer
                ? 'M14 58 C14 44, 22 38, 32 38 C42 38, 50 44, 50 58 Z'
                : 'M14 58 L14 44 C14 38, 22 36, 32 36 C42 36, 50 38, 50 44 L50 58 Z'
            }
            fill={isPlayer ? '#1D4ED8' : '#334155'}
            stroke="var(--bg-deep)"
            strokeWidth="1.5"
          />
        </svg>
        <div
          className="absolute label-cap"
          style={{
            left: 0,
            right: 0,
            top: -22,
            textAlign: 'center',
            fontSize: 10,
            color: 'var(--text-secondary)',
          }}
        >
          {label} · <span style={{ color: 'var(--text-primary)' }}>{cls}</span>
        </div>
        <div
          className="absolute"
          data-testid={`combat-hp-${side}`}
          style={{
            left: 0,
            right: 0,
            bottom: -28,
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '90%',
              height: 6,
              borderRadius: 3,
              background: 'rgba(0,0,0,0.4)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${hpPct}%`,
                height: '100%',
                background: 'var(--life-stroke)',
                transition: 'width 80ms linear',
              }}
            />
          </div>
          <div
            className="tnum"
            style={{ fontSize: 11, color: 'var(--text-primary)', fontWeight: 700 }}
          >
            {Math.max(0, hp)} / {maxHp}
          </div>
        </div>
        {burnStacks > 0 && (
          <div
            className="absolute status-pop"
            style={{
              top: -6,
              right: -6,
              width: 28,
              height: 28,
              background: 'var(--surface-elev)',
              borderRadius: 6,
              border: '2px solid var(--r-legendary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 2,
            }}
          >
            <div style={{ width: '100%', height: '100%' }}>
              <BurnGlyph />
            </div>
            <div
              className="absolute tnum"
              style={{
                right: -6,
                bottom: -6,
                background: 'var(--r-legendary)',
                borderRadius: 8,
                padding: '0 4px',
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--bg-deep)',
              }}
            >
              {burnStacks}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

