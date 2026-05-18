// relicOffer.ts — pure-function generators for mid/boss relic offers.
// Take-2 §6e Q5 + Q6 ratification: standalone module, not a RunController
// method; no RunState extension; offer is recomputed deterministically on
// demand from (runSeed, classId). M1.5a PR 3 Phase 2a.
//
// Stride derivation mirrors apps/client/src/run/sim-bridge.ts:shopSeedFor:
//   (((runSeed >>> 0) + slotMultiplier * STRIDE) >>> 0) as SimSeed
// RELIC_OFFER_STRIDE = 65519 is the largest prime strictly less than
// SHOP_REROLL_STRIDE = 65521; using a different prime guarantees the
// shop-reroll and relic-offer derived-seed spaces stay disjoint within
// 16-bit prime resolution.

import { RELICS, type ClassId, type RelicId, type SimSeed } from '@packbreaker/content';
import { createRng, type Rng } from '../rng';

/** Stride for relic-offer derived seeds. Locked at decision-log.md
 *  2026-05-11 § M1.5a Phase 1 design take-2 ratification §6e Q6. */
export const RELIC_OFFER_STRIDE = 65519;

// Slot multipliers separate mid vs boss seed derivations so calls to
// generateMidRelicOffer + generateBossRelicOffer for the same runSeed
// yield independent RNG sequences (no cross-call collision via shared
// stride).
const MID_SLOT_MULTIPLIER = 1;
const BOSS_SLOT_MULTIPLIER = 2;

function relicOfferSeed(runSeed: SimSeed, slotMultiplier: number): SimSeed {
  return (((runSeed >>> 0) + slotMultiplier * RELIC_OFFER_STRIDE) >>> 0) as SimSeed;
}

/** Fisher-Yates shuffle on a copy of the input. Integer-only via
 *  rng.nextInt; does not mutate the input. */
function shuffle<T>(items: ReadonlyArray<T>, rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Generate the mid-relic offer for a run. Pure, deterministic.
 * Returns class-eligible mid relics (classAffinity === classId ||
 * classAffinity === null). M1 ships 2 mid relics per class
 * (Tinker: resonant-anchor + catalyst; Marauder: berserkers-pendant +
 * crimson-pact); offer length is the eligible count. The classAffinity
 * === null branch is future-proof dead code in M1 (no class-neutral
 * mid relics shipped); CF 32 may add them. Stride applied internally
 * so callers pass the run's root seed.
 */
export function generateMidRelicOffer(
  runSeed: SimSeed,
  classId: ClassId,
): ReadonlyArray<RelicId> {
  const eligible: RelicId[] = [];
  // RELICS iteration via Object.values preserves insertion order
  // (ES2015 spec for string keys) which matches packages/content/src/
  // relics.ts ALL_RELICS array order.
  for (const relic of Object.values(RELICS)) {
    if (relic.slot !== 'mid') continue;
    if (relic.classAffinity !== null && relic.classAffinity !== classId) continue;
    eligible.push(relic.id);
  }
  const rng = createRng(relicOfferSeed(runSeed, MID_SLOT_MULTIPLIER));
  return shuffle(eligible, rng);
}

/**
 * Generate the boss-relic offer for a run. Pure, deterministic.
 * Returns class-eligible boss relics (classAffinity === classId — exact
 * match required; no class-neutral branch for boss). M1 ships 1 boss
 * relic per class (Tinker: worldforge-seed; Marauder: conquerors-crown).
 */
export function generateBossRelicOffer(
  runSeed: SimSeed,
  classId: ClassId,
): ReadonlyArray<RelicId> {
  const eligible: RelicId[] = [];
  for (const relic of Object.values(RELICS)) {
    if (relic.slot !== 'boss') continue;
    if (relic.classAffinity !== classId) continue;
    eligible.push(relic.id);
  }
  const rng = createRng(relicOfferSeed(runSeed, BOSS_SLOT_MULTIPLIER));
  return shuffle(eligible, rng);
}
