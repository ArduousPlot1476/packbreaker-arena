// Recipe detection — multiset match over bag items + BFS connectivity over
// edge-adjacent neighbors. Verbatim algorithm from M1.1.1 bugfix.
//
// M1.3.4a — RECIPES + Recipe + RecipeMatch types moved to run/content.ts and
// run/types.ts. cellsOf moved to bag/layout.ts. detectRecipes still drives
// the bag's per-cell glow + COMBINE button anchoring (visual-direction.md
// § 6 / decision-log 2026-04-26 ratification). scoutRecipes (added in
// M1.3.4a §7) returns inventory-based recipe possibilities — adjacency-
// independent — for the mobile [Crafting] tab's "Available with current
// items" section.

import { cellsOf } from '../bag/layout';
import { RECIPES } from './content';
import type { BagItem, ItemId, Recipe, RecipeMatch } from './types';

export type { RecipeMatch } from './types';

export function detectRecipes(bag: BagItem[]): RecipeMatch[] {
  const matches: RecipeMatch[] = [];
  const cellOwner = new Map<string, string>();
  bag.forEach((b) => cellsOf(b).forEach(([x, y]) => cellOwner.set(`${x},${y}`, b.uid)));

  function neighborsOf(b: BagItem): Set<string> {
    const ns = new Set<string>();
    cellsOf(b).forEach(([x, y]) => {
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].forEach(([dx, dy]) => {
        const k = `${x + dx},${y + dy}`;
        const u = cellOwner.get(k);
        if (u && u !== b.uid) ns.add(u);
      });
    });
    return ns;
  }

  const byUid = Object.fromEntries(bag.map((b) => [b.uid, b])) as Record<string, BagItem>;

  for (const recipe of RECIPES) {
    const need = [...recipe.inputs].sort();
    const sz = need.length;
    const items = bag.slice();

    function* combos(start: number, picked: BagItem[]): Generator<BagItem[]> {
      if (picked.length === sz) {
        yield picked.slice();
        return;
      }
      for (let i = start; i < items.length; i++) {
        picked.push(items[i]);
        yield* combos(i + 1, picked);
        picked.pop();
      }
    }

    for (const group of combos(0, [])) {
      const ids = group.map((g) => g.itemId).sort();
      if (ids.join('|') !== need.join('|')) continue;
      const set = new Set(group.map((g) => g.uid));
      const seen = new Set<string>([group[0].uid]);
      const queue: BagItem[] = [group[0]];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const n of neighborsOf(cur)) {
          if (set.has(n) && !seen.has(n)) {
            seen.add(n);
            queue.push(byUid[n]);
          }
        }
      }
      if (seen.size === sz) {
        matches.push({ recipe, uids: group.map((g) => g.uid) });
      }
    }
  }
  const seen = new Set<string>();
  return matches.filter((m) => {
    const k = m.recipe.id + ':' + [...m.uids].sort().join(',');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Inventory-based recipe scouting — returns the recipe ids the player
 *  could complete given the items they have in their bag, regardless of
 *  current adjacency. Multiset match over bag.itemId; no rearrangement
 *  search (BFS over move sequences is M3 hint-system work).
 *
 *  Surfaces "you could make X with Y + Z" in the mobile Crafting tab's
 *  scouting section per the M1.3.4a §7 ratification. Differs from
 *  detectRecipes by NOT requiring 4-neighbor edge adjacency — the player
 *  still has to physically arrange the items to combine them; this just
 *  surfaces what's possible. */
export function scoutRecipes(bag: BagItem[]): Recipe[] {
  // Build a multiset of itemIds present in the bag.
  const have = new Map<ItemId, number>();
  for (const b of bag) {
    have.set(b.itemId, (have.get(b.itemId) ?? 0) + 1);
  }

  const out: Recipe[] = [];
  for (const recipe of RECIPES) {
    // Each recipe's required multiset (e.g., {iron-sword: 1, iron-dagger: 1}
    // for r-steel-sword; {healing-herb: 2} for r-healing-salve).
    const need = new Map<ItemId, number>();
    for (const id of recipe.inputs) {
      need.set(id, (need.get(id) ?? 0) + 1);
    }
    let ok = true;
    for (const [id, count] of need) {
      if ((have.get(id) ?? 0) < count) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(recipe);
  }
  return out;
}
