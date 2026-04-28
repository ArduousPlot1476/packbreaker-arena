// @packbreaker/content — canonical item / recipe / class / relic / contract data.
//
// Barrel export for the M1.1 content package. Convenience aggregates
// (ITEMS_BY_RARITY, ITEMS_BY_CLASS_AFFINITY) are computed at module load
// from ITEMS so consumers get them without re-traversing.

import { ITEMS } from './items';
import type { ClassId, Item, ItemId, Rarity } from './schemas';

export * from './schemas';
export { ITEMS } from './items';
export { RECIPES } from './recipes';
export { CLASSES } from './classes';
export { RELICS } from './relics';
export { CONTRACTS } from './contracts';
export { FORGE_TYRANT } from './boss';
// GhostBuild, LocalSaveV1, LocalSave, TelemetryEvent, TelemetryEventName,
// DailyContractResponse, and TelemetryBatchRequest all flow from schemas.ts (§§ 12–15)
// via the `export * from './schemas'` above. shared/* re-exports them for ergonomics.

// ─── Convenience aggregates ──────────────────────────────────────────

const _byRarity = {
  common: [] as Item[],
  uncommon: [] as Item[],
  rare: [] as Item[],
  epic: [] as Item[],
  legendary: [] as Item[],
} satisfies Record<Rarity, Item[]>;

const _byAffinity = new Map<ClassId | 'neutral', Item[]>();

for (const item of Object.values(ITEMS)) {
  _byRarity[item.rarity].push(item);
  const key = item.classAffinity ?? 'neutral';
  const bucket = _byAffinity.get(key) ?? [];
  bucket.push(item);
  _byAffinity.set(key, bucket);
}

export const ITEMS_BY_RARITY: Readonly<Record<Rarity, ReadonlyArray<Item>>> =
  Object.freeze({
    common: Object.freeze([..._byRarity.common]),
    uncommon: Object.freeze([..._byRarity.uncommon]),
    rare: Object.freeze([..._byRarity.rare]),
    epic: Object.freeze([..._byRarity.epic]),
    legendary: Object.freeze([..._byRarity.legendary]),
  }) as Readonly<Record<Rarity, ReadonlyArray<Item>>>;

export const ITEMS_BY_CLASS_AFFINITY: ReadonlyMap<
  ClassId | 'neutral',
  ReadonlyArray<Item>
> = new Map(
  [..._byAffinity.entries()].map(([k, v]) => [k, Object.freeze([...v])]),
);

/** Quick lookup helper: throws if the slug doesn't match a known item. */
export function getItem(id: ItemId): Item {
  const item = ITEMS[id];
  if (!item) throw new Error(`Unknown item id: ${String(id)}`);
  return item;
}
