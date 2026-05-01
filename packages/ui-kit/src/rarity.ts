// Rarity tokens — locked palette per visual-direction.md § 3 and dual-coding
// per § 1 (color AND corner gem shape; color-blind safety is non-negotiable).
// Moved from apps/client/src/data.local.ts as part of M1.3.2's partial
// dissolution of data.local.ts. Full dissolution still M1.3.4 with sim
// integration.

export type RarityKey = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RarityDef {
  color: string;
  label: string;
  gem: string;
  glow: string;
}

export const RARITY: Record<RarityKey, RarityDef> = {
  common: { color: '#94A3B8', label: 'COMMON', gem: '◆', glow: 'glow-common' },
  uncommon: { color: '#22C55E', label: 'UNCOMMON', gem: '■', glow: 'glow-uncommon' },
  rare: { color: '#3B82F6', label: 'RARE', gem: '▲', glow: 'glow-rare' },
  epic: { color: '#A855F7', label: 'EPIC', gem: '★', glow: 'glow-epic' },
  legendary: { color: '#F59E0B', label: 'LEGENDARY', gem: '✦', glow: 'glow-legendary' },
};
