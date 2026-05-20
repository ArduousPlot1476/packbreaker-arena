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

import { CLASSES, RELICS } from '@packbreaker/content';
import type { RunOutcome } from '@packbreaker/content';
import { HeartGlyph } from '../icons/icons';
import { useRunContext } from '../run/RunContext';
import { useViewport } from '../run/useViewport';

export interface RunEndScreenProps {
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
        border: isEmpty ? '1px dashed #353535' : '1px solid var(--border, #444)',
        background: isEmpty ? 'var(--bg-card-2, #232323)' : 'var(--bg-card, #2a2a2a)',
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
          color: isEmpty ? '#6a6a6a' : '#fff',
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
        style={{
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontSize: 9,
          letterSpacing: '0.16em',
          color: '#6a6a6a',
          textTransform: 'uppercase',
        }}
      >
        {tierLabel}
      </div>
    </div>
  );
}

interface BreadcrumbPipProps {
  readonly round: number;
  readonly outcome: 'win' | 'loss' | 'untouched';
}

function BreadcrumbPip({ round, outcome }: BreadcrumbPipProps) {
  const isWin = outcome === 'win';
  const isLoss = outcome === 'loss';
  const dotStyle = isWin
    ? {
        background: 'rgba(245, 185, 66, 0.16)',
        border: '1px solid #f5b942',
        color: '#f5b942',
      }
    : isLoss
      ? {
          // Hatched fill via repeating linear gradient — color-independent
          // differentiation per design board.
          backgroundImage:
            'repeating-linear-gradient(45deg, rgba(232, 92, 92, 0.18) 0 2px, transparent 2px 5px)',
          border: '1px solid #e85c5c',
          color: '#e85c5c',
        }
      : {
          background: 'transparent',
          border: '1px dashed #3a3a3a',
          color: '#6a6a6a',
        };
  const label = isWin ? 'W' : isLoss ? 'L' : '·';
  return (
    <div
      data-testid={`runend-pip-${round}`}
      data-outcome={outcome}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}
    >
      <div
        style={{
          width: '100%',
          aspectRatio: '1 / 1',
          maxWidth: 36,
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
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

export function RunEndScreen({ onRestart }: RunEndScreenProps) {
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
  const accentColor =
    outcome === 'won' ? '#f5b942' : outcome === 'eliminated' ? '#e85c5c' : '#8a9bb0';
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
  const historyByRound = new Map<number, 'win' | 'loss'>();
  for (const entry of state.state.history) {
    historyByRound.set(entry.round, entry.outcome);
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
        background: 'var(--bg-deep, #1a1a1a)',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif',
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
          style={{
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
            fontSize: isMobile ? 10 : 11,
            letterSpacing: isMobile ? '0.18em' : '0.22em',
            color: '#9a9a9a',
            textTransform: 'uppercase',
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
          border: '1px solid #333',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.015)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: isMobile ? 0 : 96 }}>
          <span style={metaKeyStyle}>Class</span>
          <span data-testid="runend-class" style={metaValueStyle(isMobile)}>{className}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: isMobile ? 0 : 96 }}>
          <span style={metaKeyStyle}>Round</span>
          <span data-testid="runend-round" style={metaValueStyle(isMobile)}>{state.state.round} / {totalRounds}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: isMobile ? 0 : 96 }}>
          <span style={metaKeyStyle}>Hearts</span>
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
          <span style={sectionLabelStyle}>Relic loadout</span>
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

      {/* per-round breadcrumb */}
      <div style={{ width: '100%', marginBottom: 24 }}>
        <div style={{ marginBottom: 10 }}>
          <span style={sectionLabelStyle}>Per-round breakdown</span>
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
          <div
            style={{
              ...statIconStyle(isMobile),
              background: 'rgba(245, 185, 66, 0.1)',
              color: '#f5b942',
              border: '1px solid rgba(245, 185, 66, 0.35)',
            }}
          >
            ◆
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={metaKeyStyle}>Final gold</span>
            <span data-testid="runend-gold" style={statValueStyle(isMobile)}>
              {state.state.gold.toLocaleString()}
            </span>
          </div>
        </div>
        <div style={statCardStyle(isMobile)}>
          <div
            style={{
              ...statIconStyle(isMobile),
              background: 'rgba(180, 200, 220, 0.06)',
              color: '#d4dde6',
              border: '1px solid rgba(200, 215, 230, 0.25)',
            }}
          >
            ♚
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={metaKeyStyle}>Trophy value</span>
            <span data-testid="runend-trophy" style={statValueStyle(isMobile)}>
              {state.state.trophy.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', width: '100%' }}>
        <button
          data-testid="runend-restart-cta"
          type="button"
          onClick={onRestart}
          style={{
            appearance: 'none',
            border: 'none',
            background: '#f5b942',
            color: '#1a1a1a',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
            fontSize: isMobile ? 15 : 16,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: isMobile ? '14px 0' : '14px 56px',
            borderRadius: 8,
            cursor: 'pointer',
            textTransform: 'uppercase',
            width: isMobile ? '100%' : undefined,
          }}
        >
          New Run
        </button>
      </div>
    </div>
  );
}

const metaKeyStyle = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.16em',
  color: '#6a6a6a',
  textTransform: 'uppercase' as const,
};

function metaValueStyle(isMobile: boolean) {
  return {
    fontSize: isMobile ? 15 : 18,
    fontWeight: 600 as const,
    color: '#fff',
    letterSpacing: '0.02em',
  };
}

const sectionLabelStyle = {
  fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  fontSize: 10,
  letterSpacing: '0.18em',
  color: '#6a6a6a',
  textTransform: 'uppercase' as const,
};

function statCardStyle(isMobile: boolean) {
  return {
    flex: 1,
    border: '1px solid var(--border, #444)',
    borderRadius: 8,
    background: 'var(--bg-card, #2a2a2a)',
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
    color: '#fff',
    letterSpacing: '0.01em',
    fontVariantNumeric: 'tabular-nums' as const,
  };
}

export { runEndSubCopy };
