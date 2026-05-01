// Rarity-bordered presentation primitive used by bag cells and shop slots.
// Promoted from apps/client/src/ui-kit-overrides/RarityFrame.tsx during
// M1.3.2 commit 1. Visual treatment lands in commit 4 (corner gem SVG
// variants + scaled inner glow per visual-direction.md § 6).

import type { ReactNode } from 'react';
import { RARITY, type RarityKey } from './rarity';

interface RarityFrameProps {
  rarity: RarityKey;
  children: ReactNode;
  /** Width in cell units. Default 1. */
  w?: number;
  /** Height in cell units. Default 1. */
  h?: number;
  /** Cell size in pixels. Required — callers know the bag-cell or shop-card size. */
  size: number;
  dim?: boolean;
}

export function RarityFrame({
  rarity,
  children,
  w = 1,
  h = 1,
  size,
  dim = false,
}: RarityFrameProps) {
  const r = RARITY[rarity];
  const totalW = w * size;
  const totalH = h * size;
  return (
    <div
      className="relative ease-snap"
      style={{
        width: totalW,
        height: totalH,
        border: `2px solid ${r.color}`,
        borderRadius: 6,
        background: 'var(--surface)',
        boxShadow: `inset 0 0 14px ${r.color}22`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div
        className="absolute tnum no-select"
        style={{
          top: 2,
          right: 4,
          fontSize: 12,
          lineHeight: 1,
          color: r.color,
          fontWeight: 700,
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
      >
        {r.gem}
      </div>
      <div className="absolute inset-0" style={{ padding: 6 }}>
        {children}
      </div>
    </div>
  );
}
