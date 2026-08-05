// @packbreaker/content/contracts — M1.1 contract set.
//
// Three entries:
//   - 'neutral'              — vanilla contract, DEFAULT_RULESET, isDaily: false.
//   - 'forge-tyrant-boss'    — boss-only mutator for round 11. Carries the
//                              Tyrant's Wrath aura values (balance-bible.md
//                              § 15: hp 50, +2 dmg, +15% lifesteal). Used by
//                              the run controller when round 11 begins (M1.5).
//   - 'daily-placeholder'    — empty-mutator daily slot. Confirms the type
//                              plumbing for the M1.5 daily contract pipeline.

import {
  ContractId,
  DEFAULT_RULESET,
  type Contract,
  type Ruleset,
} from './schemas';

const NEUTRAL: Contract = {
  id: ContractId('neutral'),
  name: 'Neutral',
  description: 'No modifiers — the vanilla contract.',
  ruleset: DEFAULT_RULESET,
  isDaily: false,
};

/** Tyrant's Wrath, retuned 2026-08-05 against balance-bible.md § 15's ~30%
 *  first-attempt win target.
 *
 *  MEASURED, not argued. The shipped 50 / +2 / +15% put the boss at 18.9% under
 *  the balance harness's competent player model (`sell-to-fit`, 652 round-11
 *  combats) and 8.9% under the weaker one. 45 / +1 / +15% puts them at 33.6% and
 *  18.5% — on target for an average build, and still under § 15's "<10% for an
 *  incoherent build" only for bots that never sell.
 *
 *  WHY THESE TWO FIELDS AND NOT THE OTHERS. Three configurations reached ~30%:
 *  damage 0 at 50 HP (32.9%), damage 2 at 50 HP with lifesteal 0 (32.6%), and
 *  this one (31.1% at the same seed count). Damage 0 guts the named aura on its
 *  own damage axis; lifesteal 0 was the worst on the draw canary, pushing
 *  round-11 draws 7.8% -> 10.5% by making more fights close enough to end in a
 *  mutual ramp death. This split keeps all three aura components alive and costs
 *  +0.1pt of overall draw rate.
 *
 *  WHAT THIS DOES NOT FIX, stated so nobody re-measures it hoping otherwise: the
 *  round-11 fight still ends at a median tick ~60 against 100-210 everywhere
 *  else — two seconds of playback for the climax of a run. That is NOT reachable
 *  from here. The boss's total bonusBaseDamage is +7, and only 2 of it was ever
 *  this mutator: Marauder's class passive is +1 and `conquerors-crown` is +4
 *  (packages/content/src/relics.ts:113). Boss HP does not touch it either —
 *  swept 40/45/50/70/85/100 and medianTicks never left 60-61, because the median
 *  round-11 combat is the PLAYER dying, and boss HP does not change how fast
 *  that happens. Shortening the execution means the Crown, which is also a
 *  player reward and therefore cuts both ways. Left open deliberately. */
const FORGE_TYRANT_RULESET: Ruleset = {
  ...DEFAULT_RULESET,
  mutators: [
    {
      type: 'boss_only',
      hpOverride: 45,
      damageBonus: 1,
      lifestealPctBonus: 15,
    },
  ],
};

const FORGE_TYRANT_BOSS: Contract = {
  id: ContractId('forge-tyrant-boss'),
  name: 'Forge Tyrant',
  description:
    'Round 11 boss encounter — Tyrant\'s Wrath aura: 45 HP, +1 base damage, +15% global lifesteal on the boss bag.',
  ruleset: FORGE_TYRANT_RULESET,
  isDaily: false,
};

const DAILY_PLACEHOLDER: Contract = {
  id: ContractId('daily-placeholder'),
  name: 'Daily Placeholder',
  description: 'Daily contract type-plumbing placeholder — no live modifiers in M1.1.',
  ruleset: DEFAULT_RULESET,
  isDaily: true,
};

export const CONTRACTS: Readonly<Record<ContractId, Contract>> = Object.freeze({
  [NEUTRAL.id]: NEUTRAL,
  [FORGE_TYRANT_BOSS.id]: FORGE_TYRANT_BOSS,
  [DAILY_PLACEHOLDER.id]: DAILY_PLACEHOLDER,
});
