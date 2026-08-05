// Full-screen run-end summary surface. Replaces the in-layout
// RunEndOverlay (graybox, M1.5a PR 3 Phase 2b) per M1.5b PR 2 Q(a):
// post-run is an architectural bookend to ClassSelectScreen, mounted
// by RunProvider OUTSIDE the in-run layout. No TopBar / LeftRail /
// BagBoard / ShopPanel.
//
// Q(d) ratification: single responsive component with a `.mobile`
// modifier class via useViewport(). Diverges from ClassSelectScreen's
// separate-component pattern; justified by structurally identical
// content across viewports.
//
// § 4.5 R2 binding: read-only consumer of sim state via
// useRunContext(). No client-side recomputation of sim-owned
// arithmetic. The breadcrumb walks state.state.history; everything
// else reads ClientRunState fields populated by applySimSnapshot.

import { DndContext } from '@dnd-kit/core';
import { CLASSES, ITEMS, RELICS } from '@packbreaker/content';
import type { RunOutcome } from '@packbreaker/content';
import { cssVar, rgba, type PaletteKey } from '@packbreaker/ui-kit';
import { BagBoard } from '../bag/BagBoard';
import { CellSizeProvider } from '../bag/CellSize';
import { CoinGlyph, HeartGlyph } from '../icons/icons';
import { useRunContext } from '../run/RunContext';
import { useViewport } from '../run/useViewport';

/** Build-snapshot cell size. Matches RoundResolution's opponent reveal so the
 *  two read-only boards are the same object at the same scale. */
const SNAPSHOT_CELL_PX = 40;

/** Outcome accent. Amber for a win (the coin / legendary signal register),
 *  life-red for elimination, muted secondary for an abandon — all locked tokens.
 *  The values this screen used before (#f5b942 / #e85c5c / #8a9bb0) were
 *  off-palette approximations of exactly these three. */
const OUTCOME_ACCENT: Readonly<Record<Exclude<RunOutcome, 'in_progress'>, PaletteKey>> = {
  won: 'coinFill',
  eliminated: 'lifeRed',
  abandoned: 'textSecondary',
};

export interface RunEndScreenProps {
  /** Primary CTA — restart immediately with the same class + starter relic
   *  (M1.5d PR 1). Bypasses class select via useRun.replaySameClass. */
  readonly onPlayAgain: () => void;
  /** Secondary CTA — return to class select for a fresh class/relic pick
   *  (useRun.resetRun). */
  readonly onRestart: () => void;
}

const OUTCOME_LABELS: Readonly<Record<Exclude<RunOutcome, 'in_progress'>, string>> = {
  won: 'VICTORY',
  eliminated: 'DEFEAT',
  abandoned: 'RUN ABANDONED',
};

const OUTCOME_GLYPHS: Readonly<Record<Exclude<RunOutcome, 'in_progress'>, string>> = {
  won: '★',
  eliminated: '✕',
  abandoned: '⊘',
};

// Sub-copy derived from (outcome, round). Pure helper per Phase 2
// clarification (2) — same-file scope for graybox.
function runEndSubCopy(outcome: RunOutcome, round: number): string {
  if (outcome === 'won') return `Round ${round} boss defeated`;
  if (outcome === 'eliminated') return `Eliminated · Round ${round}`;
  if (outcome === 'abandoned') return `Quit at Round ${round}`;
  return '';
}

interface RelicSlotProps {
  readonly relicName: string | null;
  readonly tierLabel: 'Starter' | 'Mid' | 'Boss';
  readonly testId: string;
}

function RelicSlotCard({ relicName, tierLabel, testId }: RelicSlotProps) {
  const isEmpty = relicName === null;
  return (
    <div
      data-testid={testId}
      data-empty={isEmpty ? 'true' : 'false'}
      className="runend-relic"
      style={{
        border: isEmpty
          ? `1px dashed ${cssVar('borderDefault')}`
          : `1px solid ${cssVar('borderDefault')}`,
        background: isEmpty ? 'transparent' : cssVar('surface'),
        opacity: isEmpty ? 0.6 : 1,
        borderRadius: 8,
        padding: '16px 14px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        minHeight: 116,
      }}
    >
      <div
        className="runend-relic-name"
        style={{
          fontSize: 14,
          fontWeight: isEmpty ? 500 : 600,
          color: isEmpty ? cssVar('textMuted') : cssVar('textPrimary'),
          textAlign: 'center',
          maxWidth: '100%',
          // Mobile ellipsis per Phase 2 clarification (6); harmless on
          // desktop since names fit at the wider slot width.
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {relicName ?? '—'}
      </div>
      <div
        className="label-cap"
        style={{ fontSize: 9, letterSpacing: '0.16em', color: cssVar('textMuted') }}
      >
        {tierLabel}
      </div>
    </div>
  );
}

interface BreadcrumbPipProps {
  readonly round: number;
  readonly outcome: 'win' | 'loss' | 'draw' | 'untouched';
}

function BreadcrumbPip({ round, outcome }: BreadcrumbPipProps) {
  const isWin = outcome === 'win';
  const isLoss = outcome === 'loss';
  const isDraw = outcome === 'draw';
  const dotStyle = isWin
    ? {
        background: rgba('coinFill', 0.16),
        border: `1px solid ${cssVar('coinFill')}`,
        color: cssVar('coinFill'),
      }
    : isDraw
      ? {
          // CF-91: a draw renders as a distinct neutral "D", reusing CF-84's
          // overlay DRAW token (RoundResolution's headerColor is
          // var(--text-secondary)) rather than the loss red — the run-end strip
          // now matches the resolution overlay's honest-draw semantics. Economy
          // is UNCHANGED (a draw still cost a heart); this is display only.
          background: rgba('textSecondary', 0.14),
          border: `1px solid ${cssVar('textSecondary')}`,
          color: cssVar('textSecondary'),
        }
      : isLoss
        ? {
            // Hatched fill via repeating linear gradient — color-independent
            // differentiation per design board.
            backgroundImage: `repeating-linear-gradient(45deg, ${rgba('lifeRed', 0.18)} 0 2px, transparent 2px 5px)`,
            border: `1px solid ${cssVar('lifeRed')}`,
            color: cssVar('lifeRed'),
          }
        : {
            background: 'transparent',
            border: `1px dashed ${cssVar('borderDefault')}`,
            color: cssVar('textMuted'),
          };
  const label = isWin ? 'W' : isDraw ? 'D' : isLoss ? 'L' : '·';
  return (
    <div
      data-testid={`runend-pip-${round}`}
      data-outcome={outcome}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
    >
      <div
        className="tnum"
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          maxWidth: 36,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          ...dotStyle,
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function RunEndScreen({ onPlayAgain, onRestart }: RunEndScreenProps) {
  const { state } = useRunContext();
  const viewport = useViewport();
  const isMobile = viewport === 'mobile';
  const outcome = state.state.outcome;
  if (outcome === 'in_progress') {
    // Defensive: RunEndScreen is gated by RunProvider on
    // isRunEnded === true (mirrorsSimShouldEndRun: outcome !== 'in_progress').
    // If somehow mounted with outcome==='in_progress' return null rather
    // than render an "in progress" summary — preserves the contract
    // that RunEndScreen only renders terminal states.
    return null;
  }
  const label = OUTCOME_LABELS[outcome];
  const glyph = OUTCOME_GLYPHS[outcome];
  const subCopy = runEndSubCopy(outcome, state.state.round);
  const accentColor = cssVar(OUTCOME_ACCENT[outcome]);
  const labelStyle =
    outcome === 'won'
      ? { letterSpacing: '0.18em', fontWeight: 800 as const, fontStyle: 'normal' as const }
      : outcome === 'eliminated'
        ? { letterSpacing: '0.22em', fontWeight: 800 as const, fontStyle: 'normal' as const }
        : { letterSpacing: '0.12em', fontWeight: 600 as const, fontStyle: 'italic' as const };

  const className = CLASSES[state.state.classId]?.displayName ?? state.state.className;
  const relicSlots = state.state.relics;
  const starterName = relicSlots.starter ? RELICS[relicSlots.starter]?.name ?? null : null;
  const midName = relicSlots.mid ? RELICS[relicSlots.mid]?.name ?? null : null;
  const bossName = relicSlots.boss ? RELICS[relicSlots.boss]?.name ?? null : null;

  // Per-round breadcrumb: walk rounds 1..totalRounds, looking up each
  // round in state.history. History entries match by `.round`, NOT by
  // array index — defensive against any future history shape.
  const totalRounds = state.state.totalRounds;
  const historyByRound = new Map<number, 'win' | 'loss' | 'draw'>();
  for (const entry of state.state.history) {
    // CF-91: prefer the un-collapsed combatOutcome so a draw round renders a
    // distinct "D". Pre-CF-91 saves lack combatOutcome (optional at the load
    // boundary) — fall back to the collapsed RoundOutcome (W/L), the prior
    // behavior. Only a genuine 'draw' promotes; player_win / ghost_win keep the
    // existing win / loss pips.
    historyByRound.set(
      entry.round,
      entry.combatOutcome === 'draw' ? 'draw' : entry.outcome,
    );
  }
  const breadcrumbRounds: ReadonlyArray<BreadcrumbPipProps> = Array.from(
    { length: totalRounds },
    (_, i) => {
      const round = i + 1;
      const result = historyByRound.get(round);
      return {
        round,
        outcome: result ?? 'untouched',
      };
    },
  );

  const maxHearts = state.state.maxHearts;
  const hearts = state.state.hearts;
  const heartPipSize = isMobile ? 14 : 18;

  return (
    <div
      data-testid="run-end-screen"
      data-outcome={outcome}
      data-viewport={viewport}
      className={isMobile ? 'runend mobile' : 'runend'}
      style={{
        width: '100%',
        minHeight: '100vh',
        background: cssVar('bgDeep'),
        color: cssVar('textPrimary'),
        // Font deliberately unset — inherits Inter from html/body (index.css).
        // This screen used to pin a system stack here, which made the biggest
        // type in the game the only type not in the locked face.
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: isMobile ? '40px 20px 28px' : '56px 64px 40px',
        boxSizing: 'border-box',
        maxWidth: isMobile ? 480 : undefined,
        margin: '0 auto',
      }}
    >
      {/* outcome banner */}
      <div
        data-testid="runend-outcome"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          marginBottom: 14,
        }}
      >
        <div
          data-testid="runend-glyph"
          style={{ fontSize: isMobile ? 22 : 28, lineHeight: 1, color: accentColor, marginBottom: 4 }}
        >
          {glyph}
        </div>
        <div
          data-testid="runend-label"
          style={{
            fontSize: isMobile ? 32 : 48,
            lineHeight: 1,
            color: accentColor,
            ...labelStyle,
          }}
        >
          {label}
        </div>
        <div
          data-testid="runend-sub"
          className="label-cap"
          style={{
            fontSize: isMobile ? 10 : 11,
            letterSpacing: isMobile ? '0.18em' : '0.22em',
            color: cssVar('textSecondary'),
            marginTop: 6,
          }}
        >
          {subCopy}
        </div>
      </div>

      {/* meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isMobile ? 14 : 28,
          margin: isMobile ? '4px 0 20px' : '4px 0 28px',
          padding: isMobile ? '12px 14px' : '14px 28px',
          border: `1px solid ${cssVar('borderDefault')}`,
          borderRadius: 8,
          background: cssVar('bgMid'),
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: isMobile ? 0 : 96 }}>
          <span className="label-cap" style={metaKeyStyle}>Class</span>
          <span data-testid="runend-class" style={metaValueStyle(isMobile)}>{className}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: isMobile ? 0 : 96 }}>
          <span className="label-cap" style={metaKeyStyle}>Round</span>
          <span data-testid="runend-round" style={metaValueStyle(isMobile)}>{state.state.round} / {totalRounds}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: isMobile ? 0 : 96 }}>
          <span className="label-cap" style={metaKeyStyle}>Hearts</span>
          <span
            data-testid="runend-hearts"
            data-hearts-filled={hearts}
            data-hearts-max={maxHearts}
            style={{ display: 'flex', gap: 4, alignItems: 'center' }}
          >
            {Array.from({ length: maxHearts }).map((_, i) => (
              <div key={i} style={{ width: heartPipSize, height: heartPipSize }}>
                <HeartGlyph filled={i < hearts} />
              </div>
            ))}
          </span>
        </div>
      </div>

      {/* relic loadout */}
      <div style={{ width: '100%', marginBottom: 24 }}>
        <div style={{ marginBottom: 10 }}>
          <span className="label-cap" style={sectionLabelStyle}>Relic loadout</span>
        </div>
        <div
          data-testid="runend-relics"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 14,
          }}
        >
          <RelicSlotCard relicName={starterName} tierLabel="Starter" testId="runend-relic-starter" />
          <RelicSlotCard relicName={midName} tierLabel="Mid" testId="runend-relic-mid" />
          <RelicSlotCard relicName={bossName} tierLabel="Boss" testId="runend-relic-boss" />
        </div>
      </div>

      {/* Final bag — the "build snapshot" gdd.md § 14.6 asks for. Until now this
          screen listed relic NAMES as text and never showed the thing the player
          actually spent the run building.

          Same renderer as the player board and as RoundResolution's opponent
          reveal (BagBoard in readOnly mode inside an inert DndContext), so the
          board the player stares at all run is the board they see at the end —
          no second, subtly-different rendering to keep in sync. This is also
          the artifact a shareable run card will need. */}
      {state.bag.length > 0 && (
        <div style={{ width: '100%', marginBottom: 24 }}>
          <div style={{ marginBottom: 10 }}>
            <span className="label-cap" style={sectionLabelStyle}>
              Final build
            </span>
          </div>
          <div
            data-testid="runend-build"
            data-item-count={state.bag.length}
            style={{ display: 'flex', justifyContent: 'center' }}
          >
            <DndContext sensors={[]}>
              <CellSizeProvider value={SNAPSHOT_CELL_PX}>
                <BagBoard
                  bag={state.bag}
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

      {/* boss reward item — CF-67 conditional 9th field. Shown ONLY when the
          Legendary leg of the boss-win offer was chosen (bossRewardItemId set);
          mirrors the Boss-relic-name display above for legibility parity. No
          empty state / placeholder when the relic leg was taken — pure
          conditional presence. Single source of truth: bossRewardItemId (never a
          bag scan). */}
      {state.state.bossRewardItemId !== null && (
        <div style={{ width: '100%', marginBottom: 24 }}>
          <div style={{ marginBottom: 10 }}>
            <span className="label-cap" style={sectionLabelStyle}>Reward</span>
          </div>
          <div
            data-testid="runend-reward"
            style={{
              border: `1px solid ${cssVar('rLegendary')}`,
              background: cssVar('surface'),
              boxShadow: `inset 0 0 14px ${rgba('rLegendary', 0.22)}`,
              borderRadius: 8,
              padding: '16px 14px 14px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div
              data-testid="runend-reward-name"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: cssVar('textPrimary'),
                textAlign: 'center',
              }}
            >
              {ITEMS[state.state.bossRewardItemId]?.name ?? '—'}
            </div>
            <div
              className="label-cap"
              style={{ fontSize: 9, letterSpacing: '0.16em', color: cssVar('rLegendary') }}
            >
              Legendary
            </div>
          </div>
        </div>
      )}

      {/* per-round breadcrumb */}
      <div style={{ width: '100%', marginBottom: 24 }}>
        <div style={{ marginBottom: 10 }}>
          <span className="label-cap" style={sectionLabelStyle}>Per-round breakdown</span>
        </div>
        <div
          data-testid="runend-breadcrumb"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${totalRounds}, 1fr)`,
            gap: isMobile ? 4 : 8,
          }}
        >
          {breadcrumbRounds.map((pip) => (
            <BreadcrumbPip key={pip.round} round={pip.round} outcome={pip.outcome} />
          ))}
        </div>
      </div>

      {/* gold + trophy stats */}
      <div style={{ display: 'flex', gap: 14, width: '100%', marginBottom: 24 }}>
        <div style={statCardStyle(isMobile)}>
          {/* The real coin glyph, not a "◆" stand-in — it is the same mark the
              top bar carries all run, so the final number reads as the same
              currency the player was watching. */}
          <div
            style={{
              ...statIconStyle(isMobile),
              background: rgba('coinFill', 0.1),
              border: `1px solid ${rgba('coinFill', 0.35)}`,
              padding: isMobile ? 7 : 9,
            }}
          >
            <CoinGlyph />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="label-cap" style={metaKeyStyle}>
              Final gold
            </span>
            <span data-testid="runend-gold" className="tnum" style={statValueStyle(isMobile)}>
              {state.state.gold.toLocaleString()}
            </span>
          </div>
        </div>
        <div style={statCardStyle(isMobile)}>
          <div
            style={{
              ...statIconStyle(isMobile),
              background: rgba('accent', 0.08),
              color: cssVar('accent'),
              border: `1px solid ${rgba('accent', 0.3)}`,
            }}
          >
            ◆
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="label-cap" style={metaKeyStyle}>
              Trophy value
            </span>
            <span data-testid="runend-trophy" className="tnum" style={statValueStyle(isMobile)}>
              {state.state.trophy.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* CTAs — primary "Play Again" (same class, accent) above the muted
          "Choose new class" secondary (→ class select). Uniform across all
          terminal outcomes (won/eliminated/abandoned) for M1.5d PR 1;
          context-aware hierarchy is M2/CF 48. */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          width: '100%',
        }}
      >
        {/* Primary CTA uses --accent, the ratified primary-action token that
            every other CTA in the game uses (Continue, Next Round, Begin Run).
            It was amber here, which read as the gold/legendary signal rather
            than as an action. */}
        <button
          data-testid="runend-playagain-cta"
          type="button"
          onClick={onPlayAgain}
          className="hover-lift focus-ring ease-snap label-cap"
          style={{
            appearance: 'none',
            border: 'none',
            background: cssVar('accent'),
            color: cssVar('textPrimary'),
            font: 'inherit',
            fontSize: isMobile ? 15 : 16,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: isMobile ? '14px 0' : '14px 56px',
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: `0 6px 20px ${rgba('accent', 0.28)}`,
            width: isMobile ? '100%' : undefined,
          }}
        >
          Play Again
        </button>
        <button
          data-testid="runend-restart-cta"
          type="button"
          onClick={onRestart}
          className="hover-lift focus-ring ease-snap"
          style={{
            appearance: 'none',
            border: 'none',
            background: 'transparent',
            color: cssVar('textSecondary'),
            font: 'inherit',
            fontSize: isMobile ? 13 : 14,
            fontWeight: 600,
            letterSpacing: '0.04em',
            padding: '8px 16px',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Choose new class
        </button>
      </div>
    </div>
  );
}

// Label styles pair with the `label-cap` class (uppercase + 600 weight) at the
// call sites; only size, tracking and color live here. The monospace face these
// used to pin appeared nowhere else in the game and nowhere in
// visual-direction.md § 4, which locks Inter.
const metaKeyStyle = {
  fontSize: 10,
  letterSpacing: '0.16em',
  color: cssVar('textMuted'),
};

function metaValueStyle(isMobile: boolean) {
  return {
    fontSize: isMobile ? 15 : 18,
    fontWeight: 600 as const,
    color: cssVar('textPrimary'),
    letterSpacing: '0.02em',
  };
}

const sectionLabelStyle = {
  fontSize: 10,
  letterSpacing: '0.18em',
  color: cssVar('textMuted'),
};

function statCardStyle(isMobile: boolean) {
  return {
    flex: 1,
    border: `1px solid ${cssVar('borderDefault')}`,
    borderRadius: 8,
    background: cssVar('surface'),
    padding: isMobile ? '12px 14px' : '14px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: isMobile ? 10 : 14,
  };
}

function statIconStyle(isMobile: boolean) {
  return {
    width: isMobile ? 32 : 38,
    height: isMobile ? 32 : 38,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: isMobile ? 16 : 20,
    flex: '0 0 auto',
  };
}

function statValueStyle(isMobile: boolean) {
  return {
    fontSize: isMobile ? 18 : 22,
    fontWeight: 700 as const,
    color: cssVar('textPrimary'),
    letterSpacing: '0.01em',
    fontVariantNumeric: 'tabular-nums' as const,
  };
}

export { runEndSubCopy };
