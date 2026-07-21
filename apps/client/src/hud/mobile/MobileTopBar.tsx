// Mobile compact top bar (390-wide vertical) per gdd.md § 14 +
// M1.3.3 layout-audit decision 1 (revised). Left side: gold, hearts,
// round. Right side: opponent intent — `GhostGlyph` + up to two 20px
// mono silhouette swatches (CF-85 Surface 2a: the REAL round-ghost
// marquee, same ghostIntentForRound derivation as the desktop
// LeftRail) — grouped with the 5b.3b ⋯ run-options trigger so
// justify-between keeps them clustered. Class is implied by the
// silhouette pattern, not text.

import { useMemo } from 'react';
import type { ItemId, RunState } from '../../run/types';
import { ghostIntentForRound } from '../../combat/ghostIntent';
import { CoinGlyph, GhostGlyph, HeartGlyph, ICONS } from '../../icons/icons';
import { AbandonRunMenu } from '../../run/AbandonRunMenu';

function OpponentSilhouette({ itemIds }: { itemIds: ReadonlyArray<ItemId> }) {
  return (
    <div className="flex items-center gap-1">
      <div style={{ width: 18, height: 18 }}>
        <GhostGlyph />
      </div>
      {itemIds.map((id) => {
        const Icon = ICONS[id] ?? ICONS['copper-coin'];
        return (
          <div
            key={id}
            data-testid={`intent-silhouette-${id}`}
            style={{
              width: 20,
              height: 20,
              background: 'var(--bg-deep)',
              borderRadius: 3,
              padding: 2,
            }}
          >
            <div style={{ filter: 'brightness(0) invert(0.6)' }}>
              <Icon />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function MobileTopBar({ state }: { state: RunState }) {
  // CF-85 Surface 2a: same pure derivation as LeftRail — one intent,
  // two viewports. Memo keyed on the derivation inputs.
  const intent = useMemo(
    () => ghostIntentForRound(state.seed, state.round, state.ruleset.bagDimensions),
    [state.seed, state.round, state.ruleset.bagDimensions],
  );
  return (
    <div
      className="flex items-center justify-between"
      style={{
        height: 44,
        padding: '0 12px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-mid)',
        gap: 8,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 tnum">
          <div style={{ width: 16, height: 16 }}>
            <CoinGlyph />
          </div>
          <span
            className="heading-tight"
            style={{ fontSize: 14, color: 'var(--coin-fill)' }}
          >
            {state.gold}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          {Array.from({ length: state.maxHearts }).map((_, i) => (
            <div key={i} style={{ width: 14, height: 14 }}>
              <HeartGlyph filled={i < state.hearts} />
            </div>
          ))}
        </div>
        <div className="tnum" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          R{' '}
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{state.round}</span>
          <span style={{ color: 'var(--text-muted)' }}>/{state.totalRounds}</span>
        </div>
      </div>
      {/* 5b.3b ratification: wrap silhouette + ⋯ in a right-side
          cluster so the outer justify-between keeps them grouped
          (otherwise it would push them to opposite edges). */}
      <div className="flex items-center gap-2">
        <OpponentSilhouette itemIds={intent.marqueeItemIds} />
        <AbandonRunMenu />
      </div>
    </div>
  );
}
