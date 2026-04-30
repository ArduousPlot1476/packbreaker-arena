// Rarity-bordered presentation primitive used by bag cells and shop slots.
// apps/client-local for M1.3.1; promotion to packages/ui-kit lands in
// M1.3.2 with the visual-direction.md compliance pass.

import type { ReactNode } from 'react';
import { RARITY, type RarityKey } from '../data.local';
import { cellPx } from '../bag/layout';

interface RarityFrameProps {
  rarity: RarityKey;
  children: ReactNode;
  w?: number;
  h?: number;
  size?: number;
  dim?: boolean;
}

export function RarityFrame({
  rarity,
  children,
  w = 1,
  h = 1,
  size = cellPx,
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
