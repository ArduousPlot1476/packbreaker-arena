// Rarity tokens — locked palette per visual-direction.md § 3 and dual-coding
// per § 1 (color AND corner gem shape; color-blind safety is non-negotiable).
// Moved from apps/client/src/data.local.ts as part of M1.3.2's partial
// dissolution of data.local.ts. Full dissolution still M1.3.4 with sim
// integration.

export type RarityKey = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RarityDef {
  color: string;
  label: string;
  /**
   * Unicode glyph character. Legacy field — pre-M1.3.2 the text glyph was
   * rendered directly in the corner. Post-M1.3.2 the visible gem is rendered
   * as an SVG via `RarityGem`; this field is retained for printable/text
   * contexts (e.g. shop slot rarity label).
   */
  gem: string;
  glow: string;
  /**
   * 2-char hex alpha for the inner-glow box-shadow, scaled per rarity:
   * Common subtle (0x1A ≈ 10%) up through Legendary prominent (0x57 ≈ 34%).
   * Visual-direction.md § 6 — soft inner glow scaled to rarity.
   */
  glowAlpha: string;
  /** Inner-glow blur radius in px, scaled per rarity (10 → 22). */
  glowBlur: number;
}

export const RARITY: Record<RarityKey, RarityDef> = {
  common: {
    color: '#94A3B8',
    label: 'COMMON',
    gem: '◆',
    glow: 'glow-common',
    glowAlpha: '1A',
    glowBlur: 10,
  },
  uncommon: {
    color: '#22C55E',
    label: 'UNCOMMON',
    gem: '■',
    glow: 'glow-uncommon',
    glowAlpha: '2D',
    glowBlur: 13,
  },
  rare: {
    color: '#3B82F6',
    label: 'RARE',
    gem: '▲',
    glow: 'glow-rare',
    glowAlpha: '38',
    glowBlur: 16,
  },
  epic: {
    color: '#A855F7',
    label: 'EPIC',
    gem: '★',
    glow: 'glow-epic',
    glowAlpha: '47',
    glowBlur: 19,
  },
  legendary: {
    color: '#F59E0B',
    label: 'LEGENDARY',
    gem: '✦',
    glow: 'glow-legendary',
    glowAlpha: '57',
    glowBlur: 22,
  },
};
