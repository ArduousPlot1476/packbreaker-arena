// determinism/ghost-generator.ts — TEST SCAFFOLDING.
//
// Procedural ghost generator for the M1.2.5 determinism suite. Per ratification
// option A: ghosts are drawn from ITEMS weighted by RARITY_GATE_BY_ROUND[round-1],
// item count scales with round, class is rng-picked. Round 11 returns the
// canonical FORGE_TYRANT GhostBuild from @packbreaker/content/boss.
//
// This is NOT the M1.5 production ghost generator. M1.5's bot-fallback (per
// gdd.md § 11) is a separate design problem with different goals (realistic
// player imitation vs. deterministic coverage variety) and gets to start clean.
// Do not import from this file in production code.
//
// Per ratification: the generated ghost is recorded inline in the action
// stream's start_combat_from_ghost_build action — replay doesn't regenerate.

import {
  ClassId,
  FORGE_TYRANT,
  GhostId,
  IsoTimestamp,
  ITEMS,
  PlacementId,
  RARITY_GATE_BY_ROUND,
  SimSeed,
  type BagPlacement,
  type GhostBuild,
  type ItemId,
  type Rarity,
  type Rotation,
} from '@packbreaker/content';
import { canonicalCells } from '../../src/iteration';
import type { Rng } from '../../src/rng';

const RARITY_ORDER: ReadonlyArray<Rarity> = [
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
];

const BAG_DIMS = { width: 6, height: 4 };

/** Item count target per round. Scales gradually so early rounds aren't a
 *  one-shot and later rounds are bag-pressuring. */
const ITEM_COUNT_BY_ROUND: ReadonlyArray<number> = [
  2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
];

/** Returns a procedural GhostBuild for the given round. Rounds 1–10 are
 *  rng-driven; round 11+ returns FORGE_TYRANT. */
export function generateProceduralGhost(round: number, rng: Rng): GhostBuild {
  if (round >= 11) return FORGE_TYRANT;

  const classId: ClassId =
    rng.nextInt(0, 1) === 0 ? ClassId('tinker') : ClassId('marauder');
  const maxRarity = RARITY_GATE_BY_ROUND[round - 1] ?? 'common';
  const maxRarityIdx = RARITY_ORDER.indexOf(maxRarity);

  // Eligible item pool: rarity ≤ gate, sorted by id for deterministic iteration.
  const eligibleIds = (Object.keys(ITEMS) as ItemId[])
    .sort()
    .filter((id) => RARITY_ORDER.indexOf(ITEMS[id]!.rarity) <= maxRarityIdx);

  const targetCount = ITEM_COUNT_BY_ROUND[round - 1] ?? 2;
  const placements: BagPlacement[] = [];

  let attempts = 0;
  while (placements.length < targetCount && attempts < 50) {
    const itemId = eligibleIds[rng.nextInt(0, eligibleIds.length - 1)]!;
    const slot = findGhostPlacementSlot(placements, itemId, rng);
    if (slot) {
      placements.push({
        placementId: PlacementId(`g${placements.length}`),
        itemId,
        anchor: slot.anchor,
        rotation: slot.rotation,
      });
    }
    attempts++;
  }

  // Reserve one rng draw for a stable ghost id + seed (decouples from item-pick rng).
  const tail = rng.nextInt(0, 0x7fffffff);
  return {
    id: GhostId(`proc-r${round}-${tail.toString(16)}`),
    classId,
    bag: { dimensions: BAG_DIMS, placements },
    relics: { starter: null, mid: null, boss: null },
    recordedRound: round,
    trophyAtRecord: 0,
    seed: SimSeed(tail),
    submittedAt: IsoTimestamp('2025-01-01T00:00:00.000Z'),
    source: 'bot',
  };
}

/** Finds the first (in rotation-then-(row,col) iteration order) valid
 *  placement for `itemId` against `existing`. Rotation order is shuffled via
 *  rng to spread coverage across all four rotations. Returns null if no
 *  valid placement exists. */
function findGhostPlacementSlot(
  existing: ReadonlyArray<BagPlacement>,
  itemId: ItemId,
  rng: Rng,
): { anchor: { col: number; row: number }; rotation: Rotation } | null {
  const occupied = new Set<string>();
  for (const p of existing) {
    for (const cell of canonicalCells(p, ITEMS)) {
      occupied.add(`${cell.row}:${cell.col}`);
    }
  }

  const rotOrder = shuffleRotations(rng);

  for (const rotation of rotOrder) {
    for (let row = 0; row < BAG_DIMS.height; row++) {
      for (let col = 0; col < BAG_DIMS.width; col++) {
        const candidate: BagPlacement = {
          placementId: PlacementId('cand'),
          itemId,
          anchor: { col, row },
          rotation,
        };
        const cells = canonicalCells(candidate, ITEMS);
        let valid = true;
        for (const cell of cells) {
          if (
            cell.col < 0 ||
            cell.col >= BAG_DIMS.width ||
            cell.row < 0 ||
            cell.row >= BAG_DIMS.height ||
            occupied.has(`${cell.row}:${cell.col}`)
          ) {
            valid = false;
            break;
          }
        }
        if (valid) return { anchor: { col, row }, rotation };
      }
    }
  }
  return null;
}

/** Fisher-Yates over [0, 90, 180, 270]. Consumes 3 rng draws. */
function shuffleRotations(rng: Rng): ReadonlyArray<Rotation> {
  const rots: Rotation[] = [0, 90, 180, 270];
  for (let i = rots.length - 1; i > 0; i--) {
    const j = rng.nextInt(0, i);
    [rots[i], rots[j]] = [rots[j]!, rots[i]!];
  }
  return rots;
}
