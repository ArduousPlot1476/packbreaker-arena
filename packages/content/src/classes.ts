// @packbreaker/content/classes — Tinker and Marauder per balance-bible.md § 5.

import {
  ClassId,
  RelicId,
  type Class,
} from './schemas';

const TINKER: Class = {
  id: ClassId('tinker'),
  displayName: 'Tinker',
  passive: {
    description: 'First recipe each round costs no action; recipe outputs gain +10% effect.',
    firstRecipeFreeAction: true,
    recipeBonusPct: 10,
  },
  affinityTags: ['tool', 'gem', 'consumable'],
  starterRelicPool: [
    RelicId('apprentices-loop'),
    RelicId('pocket-forge'),
    RelicId('merchants-mark'),
  ],
  portraitArtId: 'tinker',
};

const MARAUDER: Class = {
  id: ClassId('marauder'),
  displayName: 'Marauder',
  passive: {
    description: '+1 base damage on every damage effect; round-win bonus is 3g instead of 1g.',
    bonusBaseDamage: 1,
    bonusGoldOnWin: 2,
  },
  affinityTags: ['weapon', 'armor', 'metal'],
  starterRelicPool: [
    RelicId('razors-edge'),
    RelicId('bloodfont'),
    RelicId('iron-will'),
  ],
  portraitArtId: 'marauder',
};

export const CLASSES: Readonly<Record<ClassId, Class>> = Object.freeze({
  [TINKER.id]: TINKER,
  [MARAUDER.id]: MARAUDER,
});
