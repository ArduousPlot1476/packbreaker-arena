// @packbreaker/content/relics — full M1 relic set per balance-bible.md §§ 12–13.
//
// 12 relics: 6 Tinker, 6 Marauder. Slots: starter (3 per class), mid (2 per
// class), boss (1 per class). Stacking is additive across RelicModifiers flat
// fields (computed by run controller at run start, not the sim).

import {
  ClassId,
  RelicId,
  type Relic,
} from './schemas';

const TINKER = ClassId('tinker');
const MARAUDER = ClassId('marauder');

function defineRelic(
  slug: string,
  spec: Omit<Relic, 'id' | 'artId'>,
): Relic {
  return {
    ...spec,
    id: RelicId(slug),
    artId: slug,
  };
}

const ALL_RELICS: ReadonlyArray<Relic> = [
  // Tinker (6)
  defineRelic('apprentices-loop', {
    name: "Apprentice's Loop",
    description: '+1 reroll per round.',
    classAffinity: TINKER,
    slot: 'starter',
    modifiers: { extraRerollsPerRound: 1 },
  }),
  defineRelic('pocket-forge', {
    name: 'Pocket Forge',
    description: '+15% recipe potency. Stacks with class passive.',
    classAffinity: TINKER,
    slot: 'starter',
    modifiers: { recipeBonusPct: 15 },
  }),
  defineRelic('merchants-mark', {
    name: "Merchant's Mark",
    description: 'Shop items cost 1g less.',
    classAffinity: TINKER,
    slot: 'starter',
    modifiers: { itemCostDelta: -1 },
  }),
  defineRelic('resonant-anchor', {
    name: 'Resonant Anchor',
    description: '+1 shop slot.',
    classAffinity: TINKER,
    slot: 'mid',
    modifiers: { extraShopSlots: 1 },
  }),
  defineRelic('catalyst', {
    name: 'Catalyst',
    description: '+30% recipe potency. Stacks.',
    classAffinity: TINKER,
    slot: 'mid',
    modifiers: { recipeBonusPct: 30 },
  }),
  defineRelic('worldforge-seed', {
    name: 'Worldforge Seed',
    description: '+6 starting gold and +10% recipe potency.',
    classAffinity: TINKER,
    slot: 'boss',
    modifiers: { bonusStartingGold: 6, recipeBonusPct: 10 },
  }),

  // Marauder (6)
  defineRelic('razors-edge', {
    name: "Razor's Edge",
    description: '+2 base damage on every damage effect. Stacks with class passive.',
    classAffinity: MARAUDER,
    slot: 'starter',
    modifiers: { bonusBaseDamage: 2 },
  }),
  defineRelic('bloodfont', {
    name: 'Bloodfont',
    description: '20% of damage dealt heals you.',
    classAffinity: MARAUDER,
    slot: 'starter',
    modifiers: { lifestealPct: 20 },
  }),
  defineRelic('iron-will', {
    name: 'Iron Will',
    description: '+1 heart.',
    classAffinity: MARAUDER,
    slot: 'starter',
    modifiers: { bonusHearts: 1 },
  }),
  defineRelic('berserkers-pendant', {
    name: "Berserker's Pendant",
    description: '+3 base damage on every damage effect. Stacks.',
    classAffinity: MARAUDER,
    slot: 'mid',
    modifiers: { bonusBaseDamage: 3 },
  }),
  defineRelic('crimson-pact', {
    name: 'Crimson Pact',
    description: '+35% lifesteal. Stacks.',
    classAffinity: MARAUDER,
    slot: 'mid',
    modifiers: { lifestealPct: 35 },
  }),
  defineRelic('conquerors-crown', {
    name: "Conqueror's Crown",
    description: '+4 base damage on every damage effect; +3g per round won.',
    classAffinity: MARAUDER,
    slot: 'boss',
    modifiers: { bonusBaseDamage: 4, bonusGoldOnWin: 3 },
  }),
];

export const RELICS: Readonly<Record<RelicId, Relic>> = Object.freeze(
  Object.fromEntries(ALL_RELICS.map((r) => [r.id, r])) as Record<RelicId, Relic>,
);
