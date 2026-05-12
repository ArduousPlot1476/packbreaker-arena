// ruleset.ts — composes the effective ruleset for a run from
// (contract, classId, equipped relics). Stable for the run's lifetime; the
// controller recomputes when relics are granted mid-run.
//
// The ORIGINAL contract.ruleset stays attached to RunState.contractId for
// telemetry / replay reconstruction. The EFFECTIVE ruleset (with relic-driven
// shopSize / startingHearts / rerollCostStart applied) lives privately on the
// controller and drives every read inside the run loop.
//
// Combat-side modifiers (bonusBaseDamage, lifestealPct, recipeBonusPct) flow
// through Combatant.classId + Combatant.relics — combat.ts derives them in
// deriveSideStats. The DerivedModifiers struct returned here is for run-side
// concerns only (reroll counter, item-cost delta, win-bonus gold).

import {
  CLASSES,
  RELICS,
  type ClassId,
  type Contract,
  type DerivedModifiers,
  type Relic,
  type RelicId,
  type RelicSlots,
  type Ruleset,
} from '@packbreaker/content';

// DerivedModifiers canonical declaration migrated to @packbreaker/content
// (content-schemas.ts § 10) in schema v0.6 / M1.5a PR 1. Re-exported here so
// existing sim-side imports continue to resolve.
export type { DerivedModifiers };

/** Effective ruleset + derived run-side modifiers. The starting gold credit
 *  is exposed separately because it's a one-time initialization, not part of
 *  the ruleset. */
export interface ComposedRuleset {
  readonly ruleset: Ruleset;
  readonly derived: DerivedModifiers;
  /** RelicModifiers.bonusStartingGold summed across equipped relics. The
   *  controller adds this on top of round 1's base income at run start. */
  readonly bonusStartingGold: number;
}

/** Resolves equipped relic IDs to Relic objects, skipping nulls and unknowns. */
function resolveRelics(relics: RelicSlots): ReadonlyArray<Relic> {
  const slots: ReadonlyArray<RelicId | null> = [relics.starter, relics.mid, relics.boss];
  const out: Relic[] = [];
  for (const id of slots) {
    if (id === null) continue;
    const relic = RELICS[id];
    if (relic) out.push(relic);
  }
  return out;
}

/** Composes the effective ruleset by stacking class passives (where they
 *  affect run-state) and relic modifiers on top of the contract's base ruleset.
 *
 *  Class passive note: current M1 classes (Tinker, Marauder) only contribute
 *  combat-side modifiers (bonusBaseDamage, lifestealPct, recipeBonusPct,
 *  bonusGoldOnWin, recipeBonusPct). None of them adjust Ruleset fields like
 *  shopSize / startingHearts directly. RelicModifiers.bonusGoldOnWin stacks
 *  with class.passive.bonusGoldOnWin in DerivedModifiers. */
export function composeRuleset(
  contract: Contract,
  classId: ClassId,
  relics: RelicSlots,
): ComposedRuleset {
  const cls = CLASSES[classId];
  const equippedRelics = resolveRelics(relics);

  let extraShopSlots = 0;
  let bonusHearts = 0;
  let bonusStartingGold = 0;
  let extraRerollsPerRound = 0;
  let rerollCostDelta = 0;
  let itemCostDelta = 0;
  let bonusGoldOnWin = cls?.passive.bonusGoldOnWin ?? 0;

  for (const relic of equippedRelics) {
    extraShopSlots += relic.modifiers.extraShopSlots ?? 0;
    bonusHearts += relic.modifiers.bonusHearts ?? 0;
    bonusStartingGold += relic.modifiers.bonusStartingGold ?? 0;
    extraRerollsPerRound += relic.modifiers.extraRerollsPerRound ?? 0;
    rerollCostDelta += relic.modifiers.rerollCostDelta ?? 0;
    itemCostDelta += relic.modifiers.itemCostDelta ?? 0;
    bonusGoldOnWin += relic.modifiers.bonusGoldOnWin ?? 0;
  }

  const base = contract.ruleset;
  const ruleset: Ruleset = {
    ...base,
    shopSize: base.shopSize + extraShopSlots,
    startingHearts: base.startingHearts + bonusHearts,
    rerollCostStart: Math.max(0, base.rerollCostStart + rerollCostDelta),
  };

  return {
    ruleset,
    derived: {
      extraRerollsPerRound,
      itemCostDelta,
      bonusGoldOnWin,
    },
    bonusStartingGold,
  };
}

/** Computes the base gold income for a given round number using the ruleset's
 *  step formula. round 1 → baseGoldPerRound; every goldStepRounds rounds the
 *  income increases by goldStepAmount. baseGoldPerRound + floor((round-1) /
 *  goldStepRounds) × goldStepAmount. */
export function baseIncomeForRound(round: number, ruleset: Ruleset): number {
  return (
    ruleset.baseGoldPerRound +
    Math.floor((round - 1) / ruleset.goldStepRounds) * ruleset.goldStepAmount
  );
}
