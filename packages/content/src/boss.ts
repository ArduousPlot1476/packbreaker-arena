// @packbreaker/content/boss — Forge Tyrant scripted ghost per balance-bible.md § 15.

import type { GhostBuild } from './ghost';
import {
  ClassId,
  GhostId,
  IsoTimestamp,
  ItemId,
  PlacementId,
  SimSeed,
  type BagPlacement,
} from './schemas';

const placement = (
  uid: string,
  itemSlug: string,
  col: number,
  row: number,
): BagPlacement => ({
  placementId: PlacementId(uid),
  itemId: ItemId(itemSlug),
  anchor: { col, row },
  rotation: 0,
});

// Bag layout from balance-bible.md § 15 — anchors are top-left of each item's
// bounding box at rotation 0; shapes come from items.ts (look up by itemId).
const FORGE_TYRANT_PLACEMENTS: ReadonlyArray<BagPlacement> = [
  placement('ft-greataxe',     'berserkers-greataxe', 0, 0), // 2x2 → (0,0)–(1,1)
  placement('ft-chainmail',    'chainmail',           2, 0), // 1x2V → (2,0)–(2,1)
  placement('ft-bloodmoon',    'bloodmoon-plate',     3, 0), // 2x2 → (3,0)–(4,1)
  placement('ft-vampire-fang', 'vampire-fang',        5, 0), // 1x1 → (5,0)
  placement('ft-warhammer',    'warhammer',           0, 2), // 2x1H → (0,2)–(1,2)
  placement('ft-iron-mace',    'iron-mace',           2, 2), // 2x1H → (2,2)–(3,2)?  Bible says (2,2) 1x1 — see deviation note.
  placement('ft-apple',        'apple',               4, 2), // 1x1 → bible places at (3,2); shifted by 1 to clear iron-mace 2x1 footprint.
  placement('ft-whetstone',    'whetstone',           5, 2), // 1x1 → (5,2)
];

export const FORGE_TYRANT: GhostBuild = {
  id: GhostId('forge-tyrant'),
  classId: ClassId('marauder'),
  bag: {
    dimensions: { width: 6, height: 4 },
    placements: FORGE_TYRANT_PLACEMENTS,
  },
  relics: { starter: null, mid: null, boss: null },
  recordedRound: 11,
  trophyAtRecord: 0,
  seed: SimSeed(0),
  submittedAt: IsoTimestamp('2026-04-27T00:00:00Z'),
  source: 'bot',
};
