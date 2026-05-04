// ShopController — sim-driven shop generation. M1.3.4a (closes the
// M1.3.1 deviation 1 carry-forward).
//
// Thin wrapper over sim-bridge's generateShop that keeps ShopController as
// the only client-side caller for shop generation. RunController.reducer
// dispatches reroll actions; the reducer calls into ShopController which
// in turn calls sim-bridge.
//
// Per the prompt's §3 ratification: this is shape-2 — a thin module that
// owns shop-state construction. A fuller ShopController class with its own
// reducer is out of scope for M1.3.4a; the dispatch boundary stays in
// RunController.

import type { ClassId, Ruleset, SimSeed } from '@packbreaker/content';
import { generateShop as bridgeGenerateShop } from '../run/sim-bridge';
import type { ShopSlot } from '../run/types';

/** Generates the initial shop for a fresh run (round 1, rerollCount 0).
 *  uidPrefix is the seed for stable React keys — typically `s${round}-${rerollCount}-`
 *  or a Date.now()-derived string for in-session uniqueness. */
export function generateInitialShop(
  baseSeed: SimSeed,
  classId: ClassId,
  ruleset: Ruleset,
): ShopSlot[] {
  return bridgeGenerateShop(baseSeed, 1, classId, ruleset, 0, `s1-0-`);
}

/** Generates a shop for a given (round, rerollCount). Used both for fresh
 *  rounds (rerollCount === 0) and for player-triggered rerolls
 *  (rerollCount >= 1). Determinism: identical inputs ALWAYS produce identical
 *  output via sim-bridge.shopSeedFor's deterministic seed derivation. */
export function generateShop(
  baseSeed: SimSeed,
  round: number,
  classId: ClassId,
  ruleset: Ruleset,
  rerollCount: number,
): ShopSlot[] {
  return bridgeGenerateShop(
    baseSeed,
    round,
    classId,
    ruleset,
    rerollCount,
    `s${round}-${rerollCount}-`,
  );
}
