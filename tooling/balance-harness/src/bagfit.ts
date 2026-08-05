// "Does this item fit in this bag?" — one implementation, two callers.
//
// The driver needs it to count the placeable half of the deliberation surface;
// the sell-to-fit policy needs it to decide whether to make room. Putting it in
// its own module rather than exporting it from realplay.ts keeps the import
// graph acyclic: realplay imports policies for the Policy type, so a value
// import back the other way would close a cycle.
//
// Geometry comes from the sim's own `canonicalCells`. Reimplementing bounding
// boxes and rotation here would mint a co-drift pair the moment non-rectangular
// shapes land — canonicalCells already carries the note that L/T shapes need a
// real rotation pass, and this file should inherit that fix rather than need its
// own.

import { canonicalCells } from '@packbreaker/sim';
import type {
  BagPlacement,
  BagState,
  Item,
  ItemId,
  PlacementId,
  Rotation,
} from '@packbreaker/content';

export const ALL_ROTATIONS: ReadonlyArray<Rotation> = [0, 90, 180, 270];

/** What every corpus strategy's BUY gate accepts, and only its buy gate:
 *  `findFirstValidPlacement(bag, itemId, [0])` at strategies.ts:263 and eleven
 *  sibling lines. Their PLACEMENT calls take the all-four default, so the
 *  strategies rotate items they already own and refuse to buy items that would
 *  need rotating. Exported so a policy can ask "would greedy refuse this?"
 *  rather than hard-coding the answer. */
export const GREEDY_BUY_ROTATIONS: ReadonlyArray<Rotation> = [0];

/** Cells currently occupied, keyed "row:col". */
function occupiedCells(
  bag: BagState,
  items: Readonly<Record<ItemId, Item>>,
  exclude?: PlacementId,
): Set<string> {
  const occupied = new Set<string>();
  for (const p of bag.placements) {
    if (exclude !== undefined && p.placementId === exclude) continue;
    for (const cell of canonicalCells(p, items)) {
      occupied.add(`${cell.row}:${cell.col}`);
    }
  }
  return occupied;
}

/** True iff `itemId` fits somewhere in the bag at SOME rotation.
 *
 *  All four rotations are tried, not just 0. A 2x1 that will not fit
 *  horizontally may fit vertically, and the pre-2026-08-05 count checked no
 *  rotations at all because it checked no geometry at all.
 *
 *  `exclude` treats one placement as already removed — that is how the
 *  sell-to-fit policy asks "would this fit if I sold that?" without mutating
 *  anything.
 *
 *  The bounds + overlap loop mirrors RunController.isValidPlacement
 *  (packages/sim/src/run/state.ts:1228), which is private. */
export function fitsAnywhere(
  bag: BagState,
  itemId: ItemId,
  items: Readonly<Record<ItemId, Item>>,
  exclude?: PlacementId,
  rotations: ReadonlyArray<Rotation> = ALL_ROTATIONS,
): boolean {
  const { width, height } = bag.dimensions;
  const occupied = occupiedCells(bag, items, exclude);

  for (const rotation of rotations) {
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const candidate: BagPlacement = {
          // Never inserted anywhere — canonicalCells reads only itemId, anchor
          // and rotation, so the id is inert.
          placementId: 'probe' as PlacementId,
          itemId,
          anchor: { col, row },
          rotation,
        };
        let ok = true;
        for (const cell of canonicalCells(candidate, items)) {
          if (cell.col < 0 || cell.col >= width || cell.row < 0 || cell.row >= height) {
            ok = false;
            break;
          }
          if (occupied.has(`${cell.row}:${cell.col}`)) {
            ok = false;
            break;
          }
        }
        if (ok) return true;
      }
    }
  }
  return false;
}
