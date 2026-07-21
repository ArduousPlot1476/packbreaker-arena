// Round-end overlay with reward summary + Continue. Was the prototype's
// WinOverlay sub-component of CombatOverlay; M1.3.4a commit 3 wires
// real outcome / damage / gold / hearts from the resolved CombatResult
// (commit 1's seed-bag/seed-shop dissolution removed the canned demo
// values that previously hardcoded "VICTORY +1 +18 3/3").
//
// CF-85 Surface 2b (decision-log.md 2026-07-20 § "CF-85 SCOPE REDRAWN
// against Phase-1 read-only …"): optional post-combat opponent-build
// reveal. gdd.md §14 forbids the full bag PRE-combat only; §12 names the
// post-round "view opponent build" use. Collapsed by default so the core
// reward summary is never evicted (anchor DoD 6). The board is BagBoard
// in readOnly mode — the SAME renderer the player board uses — inside a
// local inert DndContext (BagCell/DraggableItem consume dnd-kit hooks;
// no sensors, no handlers, nothing can move).

import { useState } from 'react';
import { DndContext } from '@dnd-kit/core';
import { CellSizeProvider } from '../bag/CellSize';
import { BagBoard } from '../bag/BagBoard';
import type { BagItem } from '../run/types';
import { CoinGlyph } from '../icons/icons';

/** Reveal cell size: 6 cols × 40px + BagBoard's 32px padding = 272px,
 *  inside the 360px card at both 1280×720 and 390-wide viewports. */
const REVEAL_CELL_PX = 40;

interface RoundResolutionProps {
  round: number;
  outcome: 'win' | 'loss' | 'draw';
  damageDealt: number;
  damageTaken: number;
  goldEarned: number;
  trophyEarned: number;
  hearts: number;
  maxHearts: number;
  onNext: () => void;
  /** CF-85 Surface 2b: the ghost build this round actually fought with
   *  (adapted via simBagToClientBag from the SAME Combatant the sim
   *  consumed). Optional — omitting it renders the pre-CF-85 panel. */
  opponentBuild?: {
    classLabel: string;
    bagItems: BagItem[];
  };
}

export function RoundResolution({
  round,
  outcome,
  damageDealt,
  damageTaken,
  goldEarned,
  trophyEarned,
  hearts,
  maxHearts,
  onNext,
  opponentBuild,
}: RoundResolutionProps) {
  const [showBuild, setShowBuild] = useState(false);
  const isWin = outcome === 'win';
  const isDraw = outcome === 'draw';
  // CF-84 (decision-log.md 2026-07-19 § "CF-83 RAMP + CF-84 DRAW SEMANTICS
  // RATIFIED", item 7): a draw renders honestly as DRAW, not "DEFEAT/LOST". The
  // economy is UNCHANGED — a draw still costs 1 heart + the clamped trophy delta,
  // shown below via the caller's loss-computed gold/trophy/hearts values.
  const headerColor = isWin
    ? 'var(--r-uncommon)'
    : isDraw
      ? 'var(--text-secondary)'
      : 'var(--life-stroke)';
  const headerLabel = isWin ? 'VICTORY' : isDraw ? 'DRAW' : 'DEFEAT';
  const headline = isWin
    ? 'You crushed the ghost.'
    : isDraw
      ? 'Both fell — a draw.'
      : 'The ghost outlasted you.';
  return (
    <div
      className="ease-snap"
      style={{
        width: 360,
        padding: 24,
        background: 'var(--surface-elev)',
        border: `2px solid ${headerColor}`,
        borderRadius: 8,
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      <div
        className="label-cap"
        style={{ color: headerColor, fontSize: 12, marginBottom: 6 }}
      >
        ROUND {round} — {headerLabel}
      </div>
      <div className="heading-tight" style={{ fontSize: 32, marginBottom: 16 }}>
        {headline}
      </div>
      <div className="flex items-center justify-center gap-6 mb-5">
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            GOLD
          </div>
          <div className="flex items-center gap-1 justify-center mt-1">
            <div style={{ width: 16, height: 16 }}>
              <CoinGlyph />
            </div>
            <span
              className="tnum heading-tight"
              style={{ fontSize: 22, color: 'var(--coin-fill)' }}
            >
              +{goldEarned}
            </span>
          </div>
        </div>
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            TROPHY
          </div>
          <div className="tnum heading-tight" style={{ fontSize: 22 }}>
            {/* Sign is derived, not hardcoded: CF-72 made trophyEarned signed
                (loss → negative), so a literal '+' would render '+-5'. Negative
                values already carry their own '-'. */}
            {trophyEarned >= 0 ? '+' : ''}
            {trophyEarned}
          </div>
        </div>
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            HEARTS
          </div>
          <div
            className="tnum heading-tight"
            style={{
              fontSize: 22,
              color: isWin ? 'var(--life-stroke)' : 'var(--life-stroke)',
            }}
          >
            {hearts}/{maxHearts}
          </div>
        </div>
      </div>
      <div
        className="flex items-center justify-center gap-4"
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          marginBottom: 16,
        }}
      >
        <span className="tnum">
          DEALT <span style={{ color: 'var(--text-primary)' }}>{damageDealt}</span>
        </span>
        <span className="tnum">
          TAKEN <span style={{ color: 'var(--life-stroke)' }}>{damageTaken}</span>
        </span>
      </div>
      {opponentBuild && (
        <div style={{ marginBottom: 16 }}>
          <button
            type="button"
            data-testid="view-opponent-build"
            onClick={() => setShowBuild((v) => !v)}
            className="ease-snap label-cap"
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: 6,
              // CF-85 S2b prominence (visual-playtest catch, probe evidence
              // scratch/cf85-s2b/). The reveal is correctly wired, but the
              // collapsed toggle read as a CAPTION — transparent fill, muted
              // --text-secondary, near-invisible --border-default — so players
              // scanned past it to the accent NEXT ROUND CTA. Raised to a
              // clearly-a-control SECONDARY treatment: a --surface fill gives
              // it a button body distinct from the --surface-elev card
              // (visual-direction.md § 6 "buttons are filled rectangles"),
              // --text-primary makes the label read as active, and the border
              // now registers against the fill. Deliberately NEUTRAL (no
              // accent) so it never competes with the filled-accent NEXT ROUND
              // primary — outline-vs-fill keeps the hierarchy. Tokens only, no
              // motion, behavior unchanged.
              background: 'var(--surface)',
              color: 'var(--text-primary)',
              fontSize: 11,
              letterSpacing: '0.08em',
              border: '1px solid var(--border-default)',
              cursor: 'pointer',
            }}
          >
            {showBuild ? 'HIDE OPPONENT BUILD ▴' : 'VIEW OPPONENT BUILD ▾'}
          </button>
          {showBuild && (
            <div data-testid="opponent-build-board" style={{ marginTop: 10 }}>
              <div
                data-testid="opponent-build-caption"
                className="label-cap"
                style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 2 }}
              >
                GHOST — {opponentBuild.classLabel}
              </div>
              <div className="flex justify-center">
                {/* Inert DndContext: the bag/ components consume dnd-kit
                    hooks; with no sensors and no handlers nothing is
                    interactive. readOnly keeps items undimmed but
                    non-draggable, inspector fail-closed (CF 57). */}
                <DndContext sensors={[]}>
                  <CellSizeProvider value={REVEAL_CELL_PX}>
                    <BagBoard
                      bag={opponentBuild.bagItems}
                      drag={null}
                      hover={null}
                      dimmed={false}
                      recipeMatches={[]}
                      onCombine={() => {}}
                      compact
                      readOnly
                    />
                  </CellSizeProvider>
                </DndContext>
              </div>
            </div>
          )}
        </div>
      )}
      <button
        onClick={onNext}
        className="ease-snap hover-lift label-cap"
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 6,
          background: 'var(--accent)',
          color: 'var(--text-primary)',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.08em',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        NEXT ROUND →
      </button>
    </div>
  );
}
