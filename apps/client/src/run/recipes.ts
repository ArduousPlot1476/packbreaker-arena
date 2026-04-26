// Recipe detection — multiset match over bag items + BFS connectivity over
// edge-adjacent neighbors. Verbatim extraction from App.tsx to support
// regression testing of the data adapter (M1.1.1 bugfix). Logic unchanged.

import { cellsOf, RECIPES, type BagItem, type Recipe } from '../data.local';

export interface RecipeMatch {
  recipe: Recipe;
  uids: string[];
}

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
