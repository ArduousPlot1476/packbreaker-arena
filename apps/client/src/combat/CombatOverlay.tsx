// Canned 4-second combat sequence + win-overlay handoff to
// screens/RoundResolution. Phaser scene scaffolding (CombatScene.ts,
// effects/) lands in M1.3.4 with sim integration; M1.3.1 plays the
// prototype's existing scripted animation.

import { Fragment, useEffect, useRef, useState } from 'react';
import { BurnGlyph } from '../icons/icons';
import { RoundResolution } from '../screens/RoundResolution';

type Side = 'player' | 'ghost';
type EventKind = 'hit' | 'heal' | 'burn' | 'ko';

interface CombatEvent {
  id: number;
  at: number;
  side: Side;
  kind: EventKind;
  dmg?: number;
}

const SCRIPT: Omit<CombatEvent, 'id'>[] = [
  { at: 250, side: 'ghost', kind: 'hit', dmg: 3 },
  { at: 700, side: 'player', kind: 'hit', dmg: 4 },
  { at: 1200, side: 'ghost', kind: 'hit', dmg: 2 },
  { at: 1500, side: 'ghost', kind: 'burn', dmg: 1 },
  { at: 1800, side: 'player', kind: 'heal', dmg: 3 },
  { at: 2100, side: 'ghost', kind: 'hit', dmg: 4 },
  { at: 2500, side: 'ghost', kind: 'burn', dmg: 2 },
  { at: 2900, side: 'player', kind: 'hit', dmg: 2 },
  { at: 3300, side: 'ghost', kind: 'hit', dmg: 5 },
  { at: 3700, side: 'ghost', kind: 'ko' },
];

interface CombatOverlayProps {
  active: boolean;
  onDone: () => void;
}

export function CombatOverlay({ active, onDone }: CombatOverlayProps) {
  const [events, setEvents] = useState<CombatEvent[]>([]);
  const [phase, setPhase] = useState<'combat' | 'resolved'>('combat');
  const idRef = useRef(0);

  useEffect(() => {
    if (!active) {
      setEvents([]);
      setPhase('combat');
      return;
    }
    setEvents([]);
    setPhase('combat');

    const timers: ReturnType<typeof setTimeout>[] = [];
    SCRIPT.forEach((ev) => {
      timers.push(
        setTimeout(() => {
          const id = ++idRef.current;
          const fullEvent: CombatEvent = { id, ...ev };
          setEvents((es) => [...es, fullEvent]);
          timers.push(setTimeout(() => setEvents((es) => es.filter((e) => e.id !== id)), 1100));
        }, ev.at),
      );
    });
    timers.push(setTimeout(() => setPhase('resolved'), 4000));
    return () => timers.forEach(clearTimeout);
  }, [active]);

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center"
      style={{ background: 'rgba(11,15,26,0.78)', zIndex: 50, backdropFilter: 'blur(2px)' }}
    >
      {phase === 'combat' && <CombatStage events={events} />}
      {phase === 'resolved' && <RoundResolution onNext={onDone} />}
    </div>
  );
}

function CombatStage({ events }: { events: CombatEvent[] }) {
  const sideX: Record<Side, string> = { player: '25%', ghost: '75%' };
  const burnStacks = events.filter((e) => e.side === 'ghost' && e.kind === 'burn').length;

  return (
    <div className="relative" style={{ width: '100%', height: '100%' }}>
      <Portrait side="player" label="YOU" cls="Tinker" />
      <Portrait side="ghost" label="GHOST" cls="Marauder" burnStacks={burnStacks} />
      {events.map((ev) => {
        if (ev.kind === 'ko') {
          return (
            <div
              key={ev.id}
              className="absolute hit-flash"
              style={{
                left: sideX.ghost,
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
        const isHeal = ev.kind === 'heal';
        const isBurn = ev.kind === 'burn';
        const x = sideX[ev.side];
        // Heal uses --r-uncommon (closest in-palette green); burn uses
        // --r-legendary (amber); hit uses --life-stroke. Replaced in
        // M1.3.4 with the Phaser combat scene's own VFX palette.
        const color = isHeal ? 'var(--r-uncommon)' : isBurn ? 'var(--r-legendary)' : 'var(--life-stroke)';
        const sign = isHeal ? '+' : '−';
        return (
          <Fragment key={ev.id}>
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
                  : isBurn
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
              {ev.dmg}
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
    </div>
  );
}

interface PortraitProps {
  side: Side;
  label: string;
  cls: string;
  burnStacks?: number;
}

function Portrait({ side, label, cls, burnStacks = 0 }: PortraitProps) {
  const isPlayer = side === 'player';
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
          // accent/text-secondary derivatives. CSS color-mix() would let
          // us derive these from --accent / --text-secondary at runtime;
          // M1.3.4 Phaser combat scene replaces the placeholder portraits.
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
