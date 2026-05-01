// @packbreaker/ui-kit — React component primitives + locked rarity palette.
// Populated in M1.3.2 (commit 1: RarityFrame + ItemIcon promoted from
// apps/client/src/ui-kit-overrides/). Tailwind-based, depends on the
// locked palette tokens defined in apps/client/src/index.css; ui-kit
// itself ships TS only (no CSS layer until M1.3.3+ if needed).

export { RarityFrame } from './RarityFrame';
export { RarityGem, RARITY_GEM_SHAPE } from './RarityGem';
export { ItemIcon } from './ItemIcon';
export { RARITY, type RarityKey, type RarityDef } from './rarity';
