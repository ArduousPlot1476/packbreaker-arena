// Mobile compact top bar (390-wide vertical) per gdd.md § 14 +
// M1.3.3 layout-audit decision 1 (revised). Left side: gold, hearts,
// round. Right side: opponent intent — `GhostGlyph` + two 20px mono
// silhouette swatches (sword/shield default). Class is implied by
// the silhouette pair pattern, not text.

import type { RunState } from '../../run/types';
import { CoinGlyph, GhostGlyph, HeartGlyph, ICONS } from '../../icons/icons';

function OpponentSilhouette() {
  // Default opponent silhouettes for the M1 prototype: sword + shield
  // (matches desktop LeftRail's OpponentSilhouettes at 32px → 20px on
  // mobile, monochrome via brightness(0) invert(0.6)).
  const Sword = ICONS['iron-sword'];
  const Shield = ICONS['wooden-shield'];
  return (
    <div className="flex items-center gap-1">
      <div style={{ width: 18, height: 18 }}>
        <GhostGlyph />
      </div>
      <div
        style={{
          width: 20,
          height: 20,
          background: 'var(--bg-deep)',
          borderRadius: 3,
          padding: 2,
        }}
      >
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Sword />
        </div>
      </div>
      <div
        style={{
          width: 20,
          height: 20,
          background: 'var(--bg-deep)',
          borderRadius: 3,
          padding: 2,
        }}
      >
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Shield />
        </div>
      </div>
    </div>
  );
}

export function MobileTopBar({ state }: { state: RunState }) {
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
      <OpponentSilhouette />
    </div>
  );
}
