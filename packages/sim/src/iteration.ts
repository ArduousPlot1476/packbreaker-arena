// Deterministic iteration helpers. tech-architecture.md § 4.1 rule 6:
// "Iteration order over items: always by (row, col) ascending, then by item id
// for ties." Codified here so combat / recipe-detection / effect-target code
// can never accidentally introduce non-deterministic iteration.
//
// canonicalCells takes the items registry as a parameter (instead of importing
// ITEMS directly) so this module stays content-package-agnostic and trivially
// testable. The combat module in M1.2.3 will pass ITEMS at the call site.

import type {
  BagPlacement,
  BagState,
  CellCoord,
  Item,
  ItemId,
  Rotation,
} from '@packbreaker/content';

/** Sorts placements in canonical sim-iteration order:
 *  by anchor.row asc, then anchor.col asc, then placementId asc.
 *  This is the ONLY order sim code may iterate placements in. */
export function canonicalPlacements(bag: BagState): ReadonlyArray<BagPlacement> {
  return stableSort(bag.placements, (a, b) => {
    if (a.anchor.row !== b.anchor.row) return a.anchor.row - b.anchor.row;
    if (a.anchor.col !== b.anchor.col) return a.anchor.col - b.anchor.col;
    return compareStrings(a.placementId, b.placementId);
  });
}

/** Returns the bag cells covered by a placement, in (row, col) ascending order.
 *  Used by adjacency, recipe-detection, and effect-target resolution.
 *
 *  M1 content is exclusively rectangular (1×1, 1×2, 2×1, 2×2). For non-180°
 *  rotations the bounding-box dimensions swap. Non-rectangular shapes (L, T,
 *  etc.) are post-M1 content; this implementation will need a real shape-rotation
 *  pass before then. */
export function canonicalCells(
  placement: BagPlacement,
  items: Readonly<Record<ItemId, Item>>,
): ReadonlyArray<CellCoord> {
  const item = items[placement.itemId];
  if (!item) {
    throw new Error(`canonicalCells: unknown itemId "${String(placement.itemId)}"`);
  }
  const { w, h } = boundingBox(item.shape, placement.rotation);
  const cells: CellCoord[] = [];
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      cells.push({
        col: placement.anchor.col + dx,
        row: placement.anchor.row + dy,
      });
    }
  }
  return cells;
}

/** Stable-sort wrapper. Modern JS engines (V8, SpiderMonkey, JSC) implement
 *  Array.prototype.sort as TimSort which is stable, but funnel through this
 *  helper so the dependency on stability is documented at the call site. */
export function stableSort<T>(
  items: ReadonlyArray<T>,
  compare: (a: T, b: T) => number,
): ReadonlyArray<T> {
  return [...items].sort(compare);
}

// ── helpers ──────────────────────────────────────────────────────────

function boundingBox(shape: ReadonlyArray<CellCoord>, rotation: Rotation): { w: number; h: number } {
  let maxCol = 0;
  let maxRow = 0;
  for (const c of shape) {
    if (c.col > maxCol) maxCol = c.col;
    if (c.row > maxRow) maxRow = c.row;
  }
  let w = maxCol + 1;
  let h = maxRow + 1;
  if (rotation === 90 || rotation === 270) [w, h] = [h, w];
  return { w, h };
}

// String compare without locale (locale-aware compare can vary across runtimes).
function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
