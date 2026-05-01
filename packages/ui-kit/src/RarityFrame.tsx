// Rarity-bordered presentation primitive used by bag cells and shop slots.
// Promoted from apps/client/src/ui-kit-overrides/RarityFrame.tsx during
// M1.3.2 commit 1. Visual treatment per visual-direction.md § 6 finalized
// in M1.3.2 commit 4: 1px border in rarity color, corner gem rendered as
// SVG (dual-coding for color-blind safety), and a soft inner glow whose
// alpha + blur radius scale with rarity (Common subtle → Legendary
// prominent).

import type { ReactNode } from 'react';
import { RarityGem } from './RarityGem';
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
  // Corner gem visual size scales with cell size: bag cells (~84-88px)
  // get a ~12px gem; shop cards (~42px) get a ~8px gem.
  const gemSize = Math.max(8, Math.round(size * 0.14));
  return (
    <div
      className="relative ease-snap"
      style={{
        width: totalW,
        height: totalH,
        border: `1px solid ${r.color}`,
        borderRadius: 6,
        background: 'var(--surface)',
        boxShadow: `inset 0 0 ${r.glowBlur}px ${r.color}${r.glowAlpha}`,
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div
        className="absolute no-select"
        style={{
          top: 3,
          right: 3,
          width: gemSize,
          height: gemSize,
          color: r.color,
          filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
        }}
        aria-hidden="false"
      >
        <RarityGem rarity={rarity} />
      </div>
      <div className="absolute inset-0" style={{ padding: 6 }}>
        {children}
      </div>
    </div>
  );
}
