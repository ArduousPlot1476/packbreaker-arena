// recipes.ts — sim-side recipe detection. Mirrors the M0 prototype's
// algorithm in apps/client/src/run/recipes.ts: multiset match over bag items
// + BFS connectivity over 4-directional edge-adjacent neighbors. Operates on
// the canonical BagState / BagPlacement schema, not the prototype's BagItem
// shape.
//
// Locked answer 6 (M1.2.3b): adjacency = 4-directional edge adjacency,
// diagonals do not count. Locked answer 13 (M1.2.4): combine timing —
// arranging phase only (enforced by RunController, not here). Tinker's
// firstRecipeFreeAction is a M1 no-op — recipes are already free.

import {
  type BagPlacement,
  type BagState,
  type Item,
  type ItemId,
  type PlacementId,
  type Recipe,
  type RecipeId,
} from '@packbreaker/content';
import { canonicalCells, canonicalPlacements } from '../iteration';

export interface RecipeMatch {
  readonly recipeId: RecipeId;
  /** Input placement IDs in canonical order (sorted ascending). The first
   *  entry's anchor doubles as the canonical "top-left of the input footprint"
   *  for output placement (see RunController.combineRecipe). */
  readonly inputPlacementIds: ReadonlyArray<PlacementId>;
}

/** Detects all recipe matches in the given bag. Returns matches in canonical
 *  order: recipes iterated by ID ascending; within each recipe, combinations
 *  yielded in canonicalPlacements order. Duplicates (same recipe + same input
 *  set) are de-duplicated. */
export function detectRecipes(
  bag: BagState,
  recipes: ReadonlyArray<Recipe>,
  items: Readonly<Record<ItemId, Item>>,
): ReadonlyArray<RecipeMatch> {
  const placements = canonicalPlacements(bag);
  if (placements.length === 0) return [];

  // Cell ownership: every occupied cell maps to its placement's id.
  const cellOwner = new Map<string, PlacementId>();
  for (const p of placements) {
    for (const cell of canonicalCells(p, items)) {
      cellOwner.set(`${cell.row}:${cell.col}`, p.placementId);
    }
  }

  // Adjacency map: placementId → set of edge-adjacent placementIds. 4-dir.
  const adjacency = new Map<PlacementId, ReadonlySet<PlacementId>>();
  for (const p of placements) {
    const adj = new Set<PlacementId>();
    for (const cell of canonicalCells(p, items)) {
      for (const [dr, dc] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ] as const) {
        const owner = cellOwner.get(`${cell.row + dr}:${cell.col + dc}`);
        if (owner && owner !== p.placementId) adj.add(owner);
      }
    }
    adjacency.set(p.placementId, adj);
  }

  const placementsById = new Map<PlacementId, BagPlacement>(
    placements.map((p) => [p.placementId, p]),
  );

  // Sort recipes by ID for canonical iteration order.
  const sortedRecipes = [...recipes].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const matches: RecipeMatch[] = [];
  const seenKeys = new Set<string>();

  for (const recipe of sortedRecipes) {
    const need = recipe.inputs.map((i) => i.itemId).sort();
    const sz = need.length;
    if (sz === 0) continue;

    // Generate all combinations of `sz` placements from canonicalPlacements.
    // Recursive generator mirroring the M0 prototype's combos function.
    const combos: BagPlacement[][] = [];
    function recurse(start: number, picked: BagPlacement[]): void {
      if (picked.length === sz) {
        combos.push([...picked]);
        return;
      }
      for (let i = start; i < placements.length; i++) {
        picked.push(placements[i]!);
        recurse(i + 1, picked);
        picked.pop();
      }
    }
    recurse(0, []);

    for (const group of combos) {
      // Multiset match: sorted itemIds must equal sorted needs.
      const ids = group.map((g) => g.itemId).sort();
      let mismatched = false;
      for (let i = 0; i < sz; i++) {
        if (ids[i] !== need[i]) {
          mismatched = true;
          break;
        }
      }
      if (mismatched) continue;

      // Connectivity check via BFS over edge-adjacency. Every input must be
      // reachable from any other through other inputs.
      const groupIds = new Set(group.map((g) => g.placementId));
      const seen = new Set<PlacementId>([group[0]!.placementId]);
      const queue: PlacementId[] = [group[0]!.placementId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const adj = adjacency.get(cur);
        if (!adj) continue;
        for (const n of adj) {
          if (groupIds.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      if (seen.size !== sz) continue;

      // Dedupe key: recipeId + sorted placement ids.
      const sortedPlacementIds = group
        .map((g) => g.placementId)
        .sort();
      const key = `${recipe.id}|${sortedPlacementIds.join(',')}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      matches.push({
        recipeId: recipe.id,
        inputPlacementIds: sortedPlacementIds,
      });
    }
  }

  // Suppress unused-var warning for placementsById — exposed for callers
  // that want to extract input placements; consumed by RunController.
  void placementsById;

  return matches;
}
