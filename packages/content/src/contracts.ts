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

const FORGE_TYRANT_RULESET: Ruleset = {
  ...DEFAULT_RULESET,
  mutators: [
    {
      type: 'boss_only',
      hpOverride: 50,
      damageBonus: 2,
      lifestealPctBonus: 15,
    },
  ],
};

const FORGE_TYRANT_BOSS: Contract = {
  id: ContractId('forge-tyrant-boss'),
  name: 'Forge Tyrant',
  description:
    'Round 11 boss encounter — Tyrant\'s Wrath aura: 50 HP, +2 base damage, +15% global lifesteal on the boss bag.',
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
