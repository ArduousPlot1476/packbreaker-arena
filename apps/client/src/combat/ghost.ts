// Procedural ghost template for M1.3.4a — real player-submitted ghosts
// land in M2 when the server stores per-(round, trophy_band) builds.
//
// The template scales item count + rarity-gate with round so combat
// difficulty grows monotonically: round 1 → 1 item, round 11+ → 5 items.
// Items are drawn from the iconned subset (apps/client/src/run/content
// SHOP_POOL_ITEMS) so the ghost build stays visually coherent with the
// items the player sees in their own shop. Class alternates by parity:
// odd rounds → marauder, even rounds → tinker — a deliberate
// affinity-mix so combat dynamics differ round-to-round.
//
// NOT a port of packages/sim/test/determinism/ghost-generator.ts (that
// generator is test scaffolding, ratified do-not-import in production).
// This is a fresh, simpler procedural builder; the design surface is
// intentionally narrow — it's a placeholder until M2 ghost storage and
// must remain easy to delete.

import {
  BASE_COMBATANT_HP,
  RARITY_GATE_BY_ROUND,
  type BagDimensions,
  type BagPlacement,
  type ClassId,
  type Combatant,
  type GhostId,
  type ItemId,
  type PlacementId,
  type Rarity,
  type SimSeed,
} from '@packbreaker/content';
import { createRng } from '@packbreaker/sim';
import { ITEMS, SHOP_POOL_ITEMS } from '../run/content';
import { shopSeedFor } from '../run/sim-bridge';

const RARITY_ORDER: ReadonlyArray<Rarity> = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

// 11 entries: 1 → 5 items, scaling roughly linearly. Rounds 12+ clamp to 5.
const ITEM_COUNT_BY_ROUND: ReadonlyArray<number> = [1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5];

// Reroll-stride offset for ghost seeds. We reuse shopSeedFor's stride
// formula with a sentinel value (7 × 65521) far above realistic reroll
// counts so ghost seeds never collide with shop seeds at the same round.
const GHOST_SEED_REROLL_OFFSET = 7 * 65521;

export interface GhostTemplate {
  readonly id: GhostId;
  readonly classId: ClassId;
  readonly combatant: Combatant;
}

/** Builds a deterministic Combatant for the given round + run seed.
 *
 *  M1.3.4a invariants:
 *    - Inputs (baseSeed, round) → identical GhostTemplate. Pure function.
 *    - bag.dimensions === ruleset.bagDimensions (passed in to keep the
 *      function decoupled from the ruleset import).
 *    - placements.length ≤ ITEM_COUNT_BY_ROUND[round-1] — the loop
 *      gives up after 50 attempts if the bag is too tight. */
export function makeGhostForRound(
  baseSeed: SimSeed,
  round: number,
  bagDimensions: BagDimensions,
): GhostTemplate {
  const ghostSeed = shopSeedFor(baseSeed, round, GHOST_SEED_REROLL_OFFSET);
  const rng = createRng(ghostSeed);

  const classId: ClassId = (round % 2 === 1 ? 'marauder' : 'tinker') as ClassId;
  const maxRarity = RARITY_GATE_BY_ROUND[round - 1] ?? 'common';
  const maxRarityIdx = RARITY_ORDER.indexOf(maxRarity);
  const targetCount = ITEM_COUNT_BY_ROUND[round - 1] ?? 5;

  // Pool: iconned items at or below the rarity gate. Sorted for
  // deterministic iteration (rng draws are independent of insertion order).
  const eligibleIds = (Object.keys(SHOP_POOL_ITEMS) as ItemId[])
    .sort()
    .filter((id) => RARITY_ORDER.indexOf(ITEMS[id]!.rarity) <= maxRarityIdx);

  const placements: BagPlacement[] = [];
  let attempts = 0;
  while (placements.length < targetCount && attempts < 50) {
    const itemId = eligibleIds[rng.nextInt(0, eligibleIds.length - 1)]!;
    const slot = findGhostPlacementSlot(placements, itemId, bagDimensions);
    if (slot) {
      placements.push({
        placementId: `g${placements.length}` as PlacementId,
        itemId,
        anchor: slot.anchor,
        rotation: slot.rotation,
      });
    }
    attempts++;
  }

  // HP scales gently with round (every other round +2 HP). Keeps early
  // rounds winnable and late rounds challenging without making the math
  // unreadable in the replay log.
  const startingHp = BASE_COMBATANT_HP + Math.max(0, Math.floor((round - 1) / 2)) * 2;

  const id = `ghost-r${round}-${(ghostSeed >>> 0).toString(16)}` as GhostId;

  return {
    id,
    classId,
    combatant: {
      bag: { dimensions: bagDimensions, placements },
      relics: { starter: null, mid: null, boss: null },
      classId,
      startingHp,
    },
  };
}

/** First-fit placement search using the client's ItemDef.w/h bounding
 *  boxes (rotation: width and height swap when 90/270). Iconned items in
 *  M1 are 1×1 or 1×2, so first-fit converges fast. Rotation order is
 *  fixed [0, 90, 180, 270] — purely deterministic, no rng. */
function findGhostPlacementSlot(
  existing: ReadonlyArray<BagPlacement>,
  itemId: ItemId,
  dims: BagDimensions,
): { anchor: { col: number; row: number }; rotation: 0 | 90 | 180 | 270 } | null {
  const def = ITEMS[itemId];
  if (!def) return null;
  const occupied = new Set<string>();
  for (const p of existing) {
    const pdef = ITEMS[p.itemId];
    if (!pdef) continue;
    const rotated = p.rotation === 90 || p.rotation === 270;
    const pw = rotated ? pdef.h : pdef.w;
    const ph = rotated ? pdef.w : pdef.h;
    for (let dy = 0; dy < ph; dy++) {
      for (let dx = 0; dx < pw; dx++) {
        occupied.add(`${p.anchor.row + dy}:${p.anchor.col + dx}`);
      }
    }
  }
  const rots: ReadonlyArray<0 | 90 | 180 | 270> = [0, 90, 180, 270];
  for (const rotation of rots) {
    const rotated = rotation === 90 || rotation === 270;
    const w = rotated ? def.h : def.w;
    const h = rotated ? def.w : def.h;
    for (let row = 0; row + h <= dims.height; row++) {
      for (let col = 0; col + w <= dims.width; col++) {
        let valid = true;
        for (let dy = 0; dy < h && valid; dy++) {
          for (let dx = 0; dx < w; dx++) {
            if (occupied.has(`${row + dy}:${col + dx}`)) {
              valid = false;
              break;
            }
          }
        }
        if (valid) return { anchor: { col, row }, rotation };
      }
    }
  }
  return null;
}
