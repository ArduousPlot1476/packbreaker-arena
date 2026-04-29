// shop.ts — shop generation + reroll cost. Deterministic weighted selection
// using the run's Rng. Iteration order over the eligible item pool is canonical
// (item.id ascending) so weight computation is stable across platforms.

import {
  RARITY_GATE_BY_ROUND,
  RARITY_POOL_WEIGHT,
  type ClassId,
  type Item,
  type ItemId,
  type Rarity,
  type ShopState,
} from '@packbreaker/content';
import { applyPct } from '../math';
import type { Rng } from '../rng';

const RARITY_ORDER: ReadonlyArray<Rarity> = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

interface PoolEntry {
  readonly itemId: ItemId;
  readonly weight: number;
}

/** Builds the eligible item pool for a given (round, classId), with affinity
 *  weighting applied. Iteration over Object.keys is sorted to keep the
 *  resulting pool order deterministic — weighted selection consumes rng.next()
 *  values in a position-sensitive way, so any iteration drift would break
 *  determinism. */
function buildPool(
  round: number,
  classId: ClassId,
  items: Readonly<Record<ItemId, Item>>,
): ReadonlyArray<PoolEntry> {
  const maxRarityName = RARITY_GATE_BY_ROUND[round - 1] ?? 'legendary';
  const maxRarityIdx = RARITY_ORDER.indexOf(maxRarityName);

  const pool: PoolEntry[] = [];
  // Canonical order: item.id ascending. Object.keys ordering is engine-defined
  // for non-numeric keys but a defensive .sort() guarantees byte-stable results
  // on every platform.
  const sortedIds = (Object.keys(items) as ItemId[]).sort();
  for (const id of sortedIds) {
    const item = items[id]!;
    const rarityIdx = RARITY_ORDER.indexOf(item.rarity);
    if (rarityIdx > maxRarityIdx) continue;

    let weight = RARITY_POOL_WEIGHT[item.rarity];
    if (item.classAffinity === classId) {
      // Class-affinity items: +50% weight (balance-bible.md § 14).
      weight = applyPct(weight, 50);
    } else if (item.classAffinity !== null) {
      // Other-class affinity: -25% weight.
      weight = applyPct(weight, -25);
    }
    // Neutral (classAffinity === null): base weight unchanged.

    if (weight > 0) pool.push({ itemId: id, weight });
  }
  return pool;
}

/** Cumulative-weight bucket selection. Roll an integer in [0, total-1]; walk
 *  the pool accumulating weights; the first entry whose accumulated weight
 *  exceeds the roll wins. Consumes exactly one rng.next() per slot. */
function weightedSelect(pool: ReadonlyArray<PoolEntry>, rng: Rng): ItemId {
  let total = 0;
  for (const e of pool) total += e.weight;
  if (total <= 0) {
    // Defensive: pool emptied (shouldn't happen with M1 content). Return the
    // first id in canonical order. Documented unreachable in M1.
    return pool[0]!.itemId;
  }
  const roll = rng.nextInt(0, total - 1);
  let acc = 0;
  for (const e of pool) {
    acc += e.weight;
    if (roll < acc) return e.itemId;
  }
  // Defensive fallback (would only reach if rounding made acc < roll, which
  // can't happen with integer arithmetic). Return last entry.
  return pool[pool.length - 1]!.itemId;
}

/** Generates a fresh ShopState for a given round. Items can repeat across
 *  slots — bible doesn't mandate de-duplication, and the underlying pool is
 *  weighted so duplicates are statistically rare for narrow pools and common
 *  for wide ones, which is the expected meta texture. */
export function generateShop(
  round: number,
  classId: ClassId,
  shopSize: number,
  rng: Rng,
  items: Readonly<Record<ItemId, Item>>,
): ShopState {
  const pool = buildPool(round, classId, items);
  const slots: ItemId[] = [];
  for (let i = 0; i < shopSize; i++) {
    slots.push(weightedSelect(pool, rng));
  }
  return {
    slots,
    purchased: [],
    rerollsThisRound: 0,
  };
}

/** Computes the gold cost of the next reroll for the current round.
 *
 *  Locked answer 12: the first `extraRerollsPerRound` rerolls each round cost
 *  0g (Apprentice's Loop). After they're spent, the (N+1)th reroll costs
 *  rerollCostStart + (rerollsThisRound − extraRerollsPerRound) * rerollCostIncrement. */
export function computeRerollCost(
  rerollsThisRound: number,
  rerollCostStart: number,
  rerollCostIncrement: number,
  extraRerollsPerRound: number,
): number {
  if (rerollsThisRound < extraRerollsPerRound) return 0;
  return (
    rerollCostStart + (rerollsThisRound - extraRerollsPerRound) * rerollCostIncrement
  );
}

/** Computes the effective per-item shop cost: base item.cost +
 *  itemCostDelta from relics, multiplied by ruleset.itemCostMultiplierBp.
 *  Floors at 0. itemCostMultiplierBp is identity (10000) under DEFAULT_RULESET
 *  and is reserved for future contract mutators — no current M1 contract
 *  exercises it. */
export function effectiveItemCost(
  item: Item,
  itemCostDelta: number,
  itemCostMultiplierBp: number,
): number {
  const base = Math.max(0, item.cost + itemCostDelta);
  // applyBp(base, 10000) is identity. Spec: "Apply it if non-default but
  // document as 'not exercised by M1 content.'"
  return Math.max(0, Math.floor((base * itemCostMultiplierBp) / 10000));
}

/** Sell value: applyBp(effectiveCost, sellRecoveryBp). Default 5000 bp = 50%
 *  recovery, floored. */
export function sellValueOf(
  item: Item,
  itemCostDelta: number,
  itemCostMultiplierBp: number,
  sellRecoveryBp: number,
): number {
  const cost = effectiveItemCost(item, itemCostDelta, itemCostMultiplierBp);
  return Math.floor((cost * sellRecoveryBp) / 10000);
}
