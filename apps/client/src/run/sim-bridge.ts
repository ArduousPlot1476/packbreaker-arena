// Single integration surface between the client and @packbreaker/sim.
//
// All sim calls from client code (RunController, ShopController, CombatOverlay)
// go through this module — they NEVER import @packbreaker/sim directly. This
// gives one place to install client-shape adapters at the sim boundary, and
// one place to lazy-defer sim entry points behind code-split chunks.
//
// Bridge functions are pure pass-throughs to sim with adapters. Document
// each impedance mismatch inline.

import type {
  BagDimensions,
  BagPlacement,
  BagState,
  ClassId,
  CombatInput,
  CombatResult,
  PlacementId,
  RelicSlots,
  Ruleset,
  SimSeed,
} from '@packbreaker/content';
import type { Rng } from '@packbreaker/sim';
import { createRng, generateShop as simGenerateShop, simulateCombat } from '@packbreaker/sim';
import { SHOP_POOL_ITEMS } from './content';
import type { BagItem, ItemId, ShopSlot } from './types';

/** Build a sim Rng from a base SimSeed. Identical inputs always produce
 *  identical sequences (mulberry32, integer-only) — that's the determinism
 *  contract sim's fixture suite enforces. */
export function getRunRng(seed: SimSeed): Rng {
  return createRng(seed);
}

/** Mint a SimSeed from a wall-clock-derived base. M1.3.4a: each new run
 *  uses a fresh wall-clock seed; persistence across reloads (LocalSaveV1)
 *  is M1.5+. The cast to SimSeed brand is the only place we coerce. */
export function makeRunSeed(): SimSeed {
  // Truncate Date.now() to 32-bit unsigned — sim's mulberry32 takes a
  // 32-bit seed via `seed | 0`, so high bits would be discarded anyway.
  return ((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) as SimSeed;
}

/** Derives a deterministic per-(round, rerollCount) seed from a run base
 *  seed. Stride is 65521 (largest 16-bit prime) so reroll-counter sequences
 *  for adjacent rounds stay disjoint up to ~65k rerolls per round, which is
 *  beyond any realistic play surface. Documented inline in the formula. */
const SHOP_REROLL_STRIDE = 65521;

export function shopSeedFor(baseSeed: SimSeed, round: number, rerollCount: number): SimSeed {
  // baseSeed + round * SHOP_REROLL_STRIDE + rerollCount, masked to 32 bits.
  // Stride ensures reroll-counter sequences across rounds don't collide
  // (rerollCount = 0..N at round R stays disjoint from rerollCount = 0..N
  // at round R+1, modulo a 65521-step shift).
  return (((baseSeed >>> 0) + round * SHOP_REROLL_STRIDE + rerollCount) >>> 0) as SimSeed;
}

/** Generates a shop for (round, classId, ruleset, seed). The sim returns
 *  a canonical ShopState (`{ slots: ItemId[], purchased: number[],
 *  rerollsThisRound }`); the client adapter wraps slots in client ShopSlot
 *  records (uid + itemId | null) for React-keyed rendering.
 *
 *  Pool is constrained to SHOP_POOL_ITEMS (iconned subset) — generateShop's
 *  output is therefore always renderable by the apps/client ICONS map. */
export function generateShop(
  baseSeed: SimSeed,
  round: number,
  classId: ClassId,
  ruleset: Ruleset,
  rerollCount: number,
  uidPrefix: string,
): ShopSlot[] {
  const rng = createRng(shopSeedFor(baseSeed, round, rerollCount));
  const shopState = simGenerateShop(round, classId, ruleset.shopSize, rng, SHOP_POOL_ITEMS);
  return shopState.slots.map((itemId, i) => ({
    uid: `${uidPrefix}${i}`,
    itemId: itemId as ItemId,
  }));
}

/** Adapter: client BagItem[] → canonical BagState. The client tracks
 *  uid/col/row/rot per item; sim wants placementId + anchor: CellCoord +
 *  rotation. Brand casts on uid → PlacementId and rot → Rotation are the
 *  impedance bridge — uid is already a stable per-item-instance string,
 *  rot is already 0/90/180/270. */
export function clientBagToSimBag(bag: BagItem[], dimensions: BagDimensions): BagState {
  const placements: BagPlacement[] = bag.map((b) => ({
    placementId: b.uid as PlacementId,
    itemId: b.itemId,
    anchor: { col: b.col, row: b.row },
    rotation: b.rot as 0 | 90 | 180 | 270,
  }));
  return { dimensions, placements };
}

/** Empty relic slots for M1.3.4a — the client renders a static
 *  Apprentice's Loop in the Relics rail/tab but doesn't yet model relic
 *  state (M1.5). Sim accepts empty RelicSlots; modifiers default to no-op. */
export function emptyRelicSlots(): RelicSlots {
  return { starter: null, mid: null, boss: null };
}

/** Run a combat. Pure delegation to sim's simulateCombat — the only
 *  client-side concern is constructing the CombatInput from client-shape
 *  state (handled at call sites; this bridge just forwards). */
export function runCombat(input: CombatInput): CombatResult {
  return simulateCombat(input);
}
