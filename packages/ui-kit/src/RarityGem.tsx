// Rarity corner gems — five distinct SVG shapes for dual-coding per
// visual-direction.md § 1 ("Rarity is dual-coded. Frame color AND a
// corner gem shape (◆ Common / ■ Uncommon / ▲ Rare / ★ Epic / ✦
// Legendary). Color-blind safety is non-negotiable.").
//
// Renders fill via `currentColor` so the consumer controls color via
// the parent's `color` style. 12×12 viewBox; consumer sets visual size.
//
// Silhouette discipline test #1 (visual-direction.md § 11.1): each
// shape is identifiable in pure-black-on-white at 32×32. Diamond /
// square / triangle / 5-point star / 4-point sparkle have distinct
// silhouette mass distributions — no two share more than ~30% overlap.

import type { RarityKey } from './rarity';

const Diamond = () => (
  <svg viewBox="0 0 12 12" width="100%" height="100%" fill="currentColor" aria-label="common">
    <path d="M6 1 L11 6 L6 11 L1 6 Z" />
  </svg>
);

const Square = () => (
  <svg viewBox="0 0 12 12" width="100%" height="100%" fill="currentColor" aria-label="uncommon">
    <rect x="1.5" y="1.5" width="9" height="9" />
  </svg>
);

const Triangle = () => (
  <svg viewBox="0 0 12 12" width="100%" height="100%" fill="currentColor" aria-label="rare">
    <path d="M6 1 L11 10.5 L1 10.5 Z" />
  </svg>
);

const Star = () => (
  <svg viewBox="0 0 12 12" width="100%" height="100%" fill="currentColor" aria-label="epic">
    <path d="M6 1 L7.5 4.5 L11 5 L8.25 7.5 L9 11 L6 9 L3 11 L3.75 7.5 L1 5 L4.5 4.5 Z" />
  </svg>
);

const Sparkle = () => (
  <svg viewBox="0 0 12 12" width="100%" height="100%" fill="currentColor" aria-label="legendary">
    <path d="M6 1 L7 5 L11 6 L7 7 L6 11 L5 7 L1 6 L5 5 Z" />
  </svg>
);

export const RARITY_GEM_SHAPE: Record<RarityKey, () => JSX.Element> = {
  common: Diamond,
  uncommon: Square,
  rare: Triangle,
  epic: Star,
  legendary: Sparkle,
};

export function RarityGem({ rarity }: { rarity: RarityKey }) {
  const Shape = RARITY_GEM_SHAPE[rarity];
  return <Shape />;
}
