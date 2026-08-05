// @packbreaker/content/contracts — M1.1 contract set.
//
// Three entries:
//   - 'neutral'              — vanilla contract, DEFAULT_RULESET, isDaily: false.
//   - 'forge-tyrant-boss'    — boss-only mutator for round 11. Carries the
//                              Tyrant's Wrath aura values (balance-bible.md
//                              § 15: hp 45, +1 dmg, +15% lifesteal — retuned
//                              2026-08-05, see FORGE_TYRANT_RULESET). Used by
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
 *  MEASURED, not argued. Both arms measured on the SAME population under the
 *  SAME policies (n=800 seeds; 627 and 605 round-11 combats), with the old boss
 *  reproduced through the harness's --boss-hp / --boss-damage sweep flags rather
 *  than from an older report — a stale baseline would fold the harness's own
 *  changes into the boss delta:
 *
 *              50 / +2 / +15%     45 / +1 / +15%
 *    sell-to-fit      15.5%             31.9%
 *    resolver-first    8.9%             18.5%
 *
 *  `sell-to-fit` buys a weapon, rotates, and sells a Common to make room for an
 *  Epic — § 15's "average build", and it lands on the ~30% target.
 *  `resolver-first` never sells and arrives with a stale bag; 18.5% is the right
 *  shape for that.
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
 *  from here. The boss's total bonusBaseDamage is +6 and this mutator owns only
 *  1 of it: Marauder's class passive is +1 and `conquerors-crown` is +4
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
