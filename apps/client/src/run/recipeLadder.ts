// Recipe-ladder derivation — the three-state model that teaches contiguity.
//
// The player's blocker is not "which items combine" but "owning the inputs is
// not enough; they must touch". That rule is invisible on desktop today:
// RecipeGlow only fires once inputs are ALREADY adjacent, so it confirms an
// accident rather than teaching the rule. This module names the three rungs:
//
//   KNOWN — the recipe exists. Always all 12, at every point in a run.
//   HELD  — you own the input multiset, but the placements are not contiguous.
//   READY — held AND contiguous; RecipeGlow's existing state, affords COMBINE.
//
// PREDICATE OWNERSHIP: this module derives NOTHING itself. `ready` comes from
// detectRecipes (multiset + BFS connectivity) and `held` from scoutRecipes
// (multiset only) — the same two accessors the mobile Crafting tab already
// consumes (screens/mobile/tabs/CraftingTab.tsx). Contiguity is never
// recomputed here; this module only classifies and orders what it is handed.
//
// Display names live on the canonical content recipes, not on the client's
// narrowed `Recipe` shape (run/types.ts drops `name` and `rotationLocked`), so
// the name is joined in from ICONNED_RECIPES by id.

import { ICONNED_RECIPES, RECIPES } from './content';
import type { ItemId, Recipe, RecipeMatch } from './types';

/** The three rungs, in ladder order. Ordinal is the sort key. */
export type RecipeLadderState = 'ready' | 'held' | 'known';

const STATE_ORDER: Record<RecipeLadderState, number> = {
  ready: 0,
  held: 1,
  known: 2,
};

export interface RecipeLadderRow {
  readonly recipeId: string;
  /** Canonical recipe name ('Forge Steel'), joined from ICONNED_RECIPES. */
  readonly name: string;
  readonly inputs: ReadonlyArray<ItemId>;
  readonly output: ItemId;
  readonly state: RecipeLadderState;
  /** The combinable match — non-null IF AND ONLY IF state === 'ready'. */
  readonly match: RecipeMatch | null;
}

/** Recipe id → canonical display name. Built once; RECIPES and
 *  ICONNED_RECIPES are module-level frozen content. */
const NAME_BY_ID = new Map<string, string>(
  ICONNED_RECIPES.map((r) => [String(r.id), r.name]),
);

/** Classifies all 12 known recipes into the three rungs and orders them
 *  READY → HELD → KNOWN, stable within a rung by canonical RECIPES order.
 *
 *  `ready` wins over `held` when a recipe somehow appears in both: the rungs
 *  must be mutually exclusive for the UI to render one state per row. useRun
 *  already filters scoutedRecipes against ready, so this is defence in depth,
 *  not a live overlap — but the classification must not depend on a caller
 *  upstream doing that filtering.
 *
 *  A recipe may have several ready matches (two separate contiguous clusters
 *  of the same recipe). The FIRST is carried, matching the bag's own COMBINE
 *  affordance, which anchors per cluster; the panel is a mirror, not a
 *  replacement for per-cluster combining. */
export function buildRecipeLadder(
  ready: ReadonlyArray<RecipeMatch>,
  held: ReadonlyArray<Recipe>,
): RecipeLadderRow[] {
  const readyById = new Map<string, RecipeMatch>();
  for (const m of ready) {
    if (!readyById.has(m.recipe.id)) readyById.set(m.recipe.id, m);
  }
  const heldIds = new Set(held.map((r) => r.id));

  const rows = RECIPES.map((recipe, canonicalIndex): RecipeLadderRow & { canonicalIndex: number } => {
    const match = readyById.get(recipe.id) ?? null;
    const state: RecipeLadderState = match
      ? 'ready'
      : heldIds.has(recipe.id)
        ? 'held'
        : 'known';
    return {
      recipeId: recipe.id,
      name: NAME_BY_ID.get(recipe.id) ?? recipe.id,
      inputs: recipe.inputs,
      output: recipe.output,
      state,
      match,
      canonicalIndex,
    };
  });

  rows.sort((a, b) => {
    const d = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    return d !== 0 ? d : a.canonicalIndex - b.canonicalIndex;
  });

  return rows.map(({ canonicalIndex: _canonicalIndex, ...row }) => row);
}

/** Count of rows on a given rung. Drives the panel's header tally and the
 *  bag footer's remedy line. */
export function countByState(
  rows: ReadonlyArray<RecipeLadderRow>,
  state: RecipeLadderState,
): number {
  let n = 0;
  for (const r of rows) if (r.state === state) n++;
  return n;
}
