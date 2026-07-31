// Rarity-bordered presentation primitive used by bag cells and shop slots.
// Promoted from apps/client/src/ui-kit-overrides/RarityFrame.tsx during
// M1.3.2 commit 1. Visual treatment per visual-direction.md § 6 finalized
// in M1.3.2 commit 4: 1px border in rarity color, corner gem rendered as
// SVG (dual-coding for color-blind safety), and a soft inner glow whose
// alpha + blur radius scale with rarity (Common subtle → Legendary
// prominent).

import type { ReactNode } from 'react';
import { AdjacencyMark } from './AdjacencyMark';
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
  /**
   * CF-95b: render the adjacency mechanism mark in the BOTTOM-LEFT corner —
   * diagonally opposite the rarity gem, so the two corner marks never read as
   * a matched pair. A BINARY flag (this item has a cross-item mechanic), never
   * a magnitude: one shape, one color, identical on all 10 adjacency items.
   *
   * Opt-in and default OFF. Only the shop card passes it today: the bag-cell
   * mount renders at a different size whose small-glyph noise floor has not
   * been measured, so extending it there is a separate decision.
   */
  adjacency?: boolean;
}

export function RarityFrame({
  rarity,
  children,
  w = 1,
  h = 1,
  size,
  dim = false,
  adjacency = false,
}: RarityFrameProps) {
  const r = RARITY[rarity];
  const totalW = w * size;
  const totalH = h * size;
  // Corner gem visual size scales with cell size: bag cells (~84-88px)
  // get a ~12px gem; shop cards (~42px) get a ~8px gem.
  const gemSize = Math.max(8, Math.round(size * 0.14));
  // The adjacency mark mirrors the gem's rule EXACTLY rather than picking its
  // own number, so the two corners stay optically matched at every mount size
  // (8px at size 42, 12px at size 84) and neither can drift from the other.
  // Sharing the formula is the point — a second hand-tuned constant is the
  // failure mode this codebase already paid for once.
  const markSize = gemSize;
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
      {adjacency && (
        <div
          className="absolute no-select"
          style={{
            bottom: 3,
            left: 3,
            width: markSize,
            height: markSize,
            // ACHROMATIC BY RULING, not by taste. Every chromatic token in
            // visual-direction.md § 2 is either a rarity color, shares a hex
            // with one (accent == rarity-rare, text-secondary ==
            // rarity-common, coin-gold == rarity-legendary), or is reserved to
            // another meaning (life-red = damage, arcane-cyan = Mana Potion's
            // own fill — and Mana Potion is one of the marked items). Rarity
            // owns hue; this owns shape. text-muted is the only other legal
            // token and it renders 3.30:1 on --surface, too low for an 8px
            // glyph; --text-primary renders 14.22:1.
            color: 'var(--text-primary)',
            filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
          }}
          data-testid="adjacency-mark"
          aria-hidden="false"
        >
          <AdjacencyMark />
        </div>
      )}
      <div className="absolute inset-0" style={{ padding: 6 }}>
        {children}
      </div>
    </div>
  );
}
