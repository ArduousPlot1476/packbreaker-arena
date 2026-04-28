// iteration.test.ts — canonical iteration order is the deterministic backbone
// of combat resolution; these tests are what catches a future "let's iterate
// items by insertion order, it's faster" temptation.

import { describe, expect, it } from 'vitest';
import {
  ItemId,
  PlacementId,
  SimSeed,
  type BagPlacement,
  type BagState,
  type EntityRef,
  type Item,
  type ItemRef,
} from '@packbreaker/content';
import {
  canonicalCells,
  canonicalPlacements,
  resolveTarget,
  stableSort,
  TICK_PHASES,
} from '../src/iteration';
import { createRng } from '../src/rng';

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

describe('TICK_PHASES', () => {
  it('declares the 6 phases in run order', () => {
    expect(TICK_PHASES).toEqual([
      'round_start',
      'cooldowns',
      'damage_resolution',
      'status_ticks',
      'low_health',
      'cleanup',
    ]);
  });

  it('is a const-asserted readonly tuple (length 6)', () => {
    expect(TICK_PHASES.length).toBe(6);
  });
});

describe('resolveTarget', () => {
  function bag(...slugs: string[]): BagState {
    return {
      dimensions: { width: 6, height: 4 },
      placements: slugs.map((slug, i) => ({
        placementId: PlacementId(`p${i}`),
        itemId: ItemId(slug),
        anchor: { col: i, row: 0 },
        rotation: 0,
      })),
    };
  }

  it('"self" returns the source side (player → player, ghost → ghost)', () => {
    const rng = createRng(SimSeed(1));
    expect(resolveTarget('self', 'player', bag(), bag(), rng)).toBe('player');
    expect(resolveTarget('self', 'ghost', bag(), bag(), rng)).toBe('ghost');
  });

  it('"opponent" returns the opposite side', () => {
    const rng = createRng(SimSeed(1));
    expect(resolveTarget('opponent', 'player', bag(), bag(), rng)).toBe('ghost');
    expect(resolveTarget('opponent', 'ghost', bag(), bag(), rng)).toBe('player');
  });

  it('"self_random_item" on a single-item bag returns that item, consumes 1 rng.next()', () => {
    const rng = createRng(SimSeed(1));
    const stateBefore = rng.state;
    const r = resolveTarget('self_random_item', 'player', bag('iron-sword'), bag(), rng);
    expect(rng.state).not.toBe(stateBefore); // 1 rng call consumed
    expect(r).toEqual<ItemRef>({ side: 'player', placementId: PlacementId('p0') });
  });

  it('"opp_random_item" picks deterministically from a 4-item bag with a fixed seed', () => {
    const oppBag = bag('iron-sword', 'iron-dagger', 'healing-herb', 'spark-stone');
    const rng1 = createRng(SimSeed(42));
    const rng2 = createRng(SimSeed(42));
    const r1 = resolveTarget('opp_random_item', 'player', bag(), oppBag, rng1);
    const r2 = resolveTarget('opp_random_item', 'player', bag(), oppBag, rng2);
    expect(r1).toEqual(r2); // determinism
    // Returned item must be one of the 4 placements, side must be 'ghost'
    expect((r1 as ItemRef).side).toBe('ghost');
    expect(['p0', 'p1', 'p2', 'p3']).toContain((r1 as ItemRef).placementId as string);
  });

  it('random selector on an empty bag returns null and consumes 0 rng calls', () => {
    const rng = createRng(SimSeed(1));
    const stateBefore = rng.state;
    // self=player, player's own bag empty → null
    const r1 = resolveTarget('self_random_item', 'player', bag(), bag('foo'), rng);
    // source=ghost, opp=player, player bag empty → null
    const r2 = resolveTarget('opp_random_item', 'ghost', bag(), bag('foo'), rng);
    expect(r1).toBeNull();
    expect(r2).toBeNull();
    expect(rng.state).toBe(stateBefore); // no rng consumption
  });

  it('5-call mix consumes exactly 2 rng.next() calls when 2 are random + non-empty', () => {
    const rng = createRng(SimSeed(7));
    const before = rng.state;
    // call 1: 'self' — no rng
    resolveTarget('self', 'player', bag('a'), bag('b'), rng);
    // call 2: 'self_random_item' — 1 rng
    resolveTarget('self_random_item', 'player', bag('a'), bag('b'), rng);
    // call 3: 'opponent' — no rng
    resolveTarget('opponent', 'ghost', bag('a'), bag('b'), rng);
    // call 4: 'opp_random_item' on EMPTY opp bag — no rng
    resolveTarget('opp_random_item', 'player', bag('a'), bag(), rng);
    // call 5: 'self_random_item' — 1 rng
    resolveTarget('self_random_item', 'ghost', bag('a'), bag('b'), rng);

    // Verify: state advanced exactly 2 next() calls from `before`
    const reference = createRng(SimSeed(7));
    reference.next();
    reference.next();
    expect(rng.state).toBe(reference.state);
    expect(rng.state).not.toBe(before);
  });

  it('"self_random_item" picks from the source side, not the opposite', () => {
    const rng = createRng(SimSeed(99));
    const playerBag = bag('player-item-a');
    const ghostBag = bag('ghost-item-a', 'ghost-item-b');
    const r = resolveTarget('self_random_item', 'ghost', playerBag, ghostBag, rng);
    expect((r as ItemRef).side).toBe('ghost');
    expect(['p0', 'p1']).toContain((r as ItemRef).placementId as string);
  });
});

// helper type-import is consumed by the cast above
const _exhaustEntityRef: EntityRef = 'player';
void _exhaustEntityRef;

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
