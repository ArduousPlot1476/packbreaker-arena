// iteration.test.ts — canonical iteration order is the deterministic backbone
// of combat resolution; these tests are what catches a future "let's iterate
// items by insertion order, it's faster" temptation.

import { describe, expect, it } from 'vitest';
import {
  ItemId,
  PlacementId,
  type BagPlacement,
  type BagState,
  type Item,
} from '@packbreaker/content';
import {
  canonicalCells,
  canonicalPlacements,
  stableSort,
} from '../src/iteration';

function placement(uid: string, itemSlug: string, col: number, row: number, rot: 0 | 90 | 180 | 270 = 0): BagPlacement {
  return {
    placementId: PlacementId(uid),
    itemId: ItemId(itemSlug),
    anchor: { col, row },
    rotation: rot,
  };
}

function item(slug: string, shape: ReadonlyArray<{ col: number; row: number }>): Item {
  return {
    id: ItemId(slug),
    name: slug,
    rarity: 'common',
    classAffinity: null,
    shape,
    tags: [],
    cost: 3,
    triggers: [],
    artId: slug,
  };
}

describe('canonicalPlacements', () => {
  it('sorts by row asc, then col asc within row', () => {
    const bag: BagState = {
      dimensions: { width: 6, height: 4 },
      placements: [
        placement('p1', 'iron-sword', 0, 0),
        placement('p2', 'iron-sword', 1, 2),
        placement('p3', 'iron-sword', 2, 1),
        placement('p4', 'iron-sword', 1, 0),
      ],
    };
    const sorted = canonicalPlacements(bag);
    const tuples = sorted.map((p) => [p.anchor.row, p.anchor.col]);
    // (0,0), (0,1), (1,2), (2,1)  — row asc, col asc within row
    expect(tuples).toEqual([
      [0, 0],
      [0, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it('breaks ties by placementId ascending', () => {
    const bag: BagState = {
      dimensions: { width: 6, height: 4 },
      placements: [
        placement('z-tail', 'iron-sword', 0, 0),
        placement('a-head', 'iron-sword', 0, 0),
        placement('m-mid',  'iron-sword', 0, 0),
      ],
    };
    const sorted = canonicalPlacements(bag);
    expect(sorted.map((p) => p.placementId as string)).toEqual(['a-head', 'm-mid', 'z-tail']);
  });

  it('returns empty array for empty bag', () => {
    const bag: BagState = { dimensions: { width: 6, height: 4 }, placements: [] };
    expect(canonicalPlacements(bag)).toEqual([]);
  });
});

describe('canonicalCells', () => {
  const items = {
    [ItemId('iron-dagger')]:  item('iron-dagger',  [{ col: 0, row: 0 }]),
    [ItemId('iron-sword')]:   item('iron-sword',   [{ col: 0, row: 0 }, { col: 0, row: 1 }]),
    [ItemId('ember-brand')]:  item('ember-brand',  [{ col: 0, row: 0 }, { col: 1, row: 0 }]),
    [ItemId('greatsword')]:   item('greatsword',   [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 1 }]),
  } as Readonly<Record<ItemId, Item>>;

  it('1×2 V at anchor (1,0) → [{1,0}, {1,1}]', () => {
    const cells = canonicalCells(placement('p', 'iron-sword', 1, 0), items);
    expect(cells).toEqual([
      { col: 1, row: 0 },
      { col: 1, row: 1 },
    ]);
  });

  it('2×1 H at anchor (0,0) → [{0,0}, {1,0}]', () => {
    const cells = canonicalCells(placement('p', 'ember-brand', 0, 0), items);
    expect(cells).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
  });

  it('2×2 at anchor (0,0) → [{0,0}, {1,0}, {0,1}, {1,1}]', () => {
    const cells = canonicalCells(placement('p', 'greatsword', 0, 0), items);
    expect(cells).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 1 },
    ]);
  });

  it('1×1 at arbitrary anchor → single cell', () => {
    const cells = canonicalCells(placement('p', 'iron-dagger', 4, 3), items);
    expect(cells).toEqual([{ col: 4, row: 3 }]);
  });

  it('1×2 V rotated 90° at anchor (0,0) → 2×1 H footprint', () => {
    const cells = canonicalCells(placement('p', 'iron-sword', 0, 0, 90), items);
    expect(cells).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
    ]);
  });

  it('unknown itemId throws', () => {
    expect(() => canonicalCells(placement('p', 'no-such-item', 0, 0), items)).toThrow(
      /unknown itemId/,
    );
  });
});

describe('stableSort', () => {
  it('preserves original order on equal keys', () => {
    type Tagged = { v: number; tag: string };
    const items: ReadonlyArray<Tagged> = [
      { v: 1, tag: 'a' }, { v: 2, tag: 'b' }, { v: 1, tag: 'c' },
      { v: 2, tag: 'd' }, { v: 1, tag: 'e' }, { v: 2, tag: 'f' },
    ];
    const sorted = stableSort(items, (x, y) => x.v - y.v);
    // All v=1 items stay in original relative order, then all v=2 likewise.
    expect(sorted.map((t) => t.tag)).toEqual(['a', 'c', 'e', 'b', 'd', 'f']);
  });

  it('preserves original order when comparator always returns 0', () => {
    const N = 100;
    const items = Array.from({ length: N }, (_, i) => ({ original: i }));
    const sorted = stableSort(items, () => 0);
    expect(sorted.map((x) => x.original)).toEqual(items.map((x) => x.original));
  });

  it('does not mutate the input array', () => {
    const original = [3, 1, 4, 1, 5, 9, 2, 6];
    const copy = [...original];
    stableSort(original, (a, b) => a - b);
    expect(original).toEqual(copy);
  });
});
