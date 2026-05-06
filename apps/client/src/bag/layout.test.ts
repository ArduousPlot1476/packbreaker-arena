// Unit tests for combineAnchorPosition's four-direction first-fit
// algorithm (M0 deferred item 1 closure) + computeBagLayout (M1.4a
// BagLayout handshake foundation).

import { describe, expect, it } from 'vitest';
import type { BagDimensions, PlacementId } from '@packbreaker/content';
import type { BagItem, ItemId } from '../run/types';
import { combineAnchorPosition, computeBagLayout } from './layout';

function place(uid: string, itemId: ItemId, col: number, row: number): BagItem {
  return { uid, itemId, col, row, rot: 0 };
}

// All items used in these tests are 1×1 — single-cell occupancy keeps
// the cluster-bounds and collision math straightforward to reason about.
const HERB = 'healing-herb' as ItemId;
const SPARK = 'spark-stone' as ItemId;
const WHET = 'whetstone' as ItemId;
const APPLE = 'apple' as ItemId;
const COIN = 'copper-coin' as ItemId;
const DAGGER = 'iron-dagger' as ItemId;

describe('combineAnchorPosition — four-direction first-fit', () => {
  it('returns null when the cluster has no resolvable cells', () => {
    expect(combineAnchorPosition(['ghost'], [])).toBeNull();
  });

  it('picks upper-right for a typical mid-board cluster with no conflicts', () => {
    const bag: BagItem[] = [
      place('a', DAGGER, 2, 1),
      place('b', APPLE, 3, 1),
    ];
    const result = combineAnchorPosition(['a', 'b'], bag);
    expect(result?.direction).toBe('upper-right');
    expect(result?.fallback).toBe(false);
  });

  it('falls through to lower-right when the cluster touches the top edge', () => {
    // Both upper-* anchors fail off-grid (rect.y = -30); lower-right
    // beats lower-left in priority order even though both are clear.
    const bag: BagItem[] = [
      place('a', HERB, 2, 0),
      place('b', SPARK, 3, 0),
    ];
    const result = combineAnchorPosition(['a', 'b'], bag);
    expect(result?.direction).toBe('lower-right');
    expect(result?.fallback).toBe(false);
  });

  it('falls through to upper-left when the cluster touches the right edge', () => {
    // upper-right rect extends past x = BAG_COLS * cellPx → off-grid.
    const bag: BagItem[] = [
      place('a', DAGGER, 5, 1),
      place('b', APPLE, 5, 2),
    ];
    const result = combineAnchorPosition(['a', 'b'], bag);
    expect(result?.direction).toBe('upper-left');
    expect(result?.fallback).toBe(false);
  });

  it('falls all the way to lower-left at the top-right corner', () => {
    // upper-right + upper-left fail off-grid (top); lower-right fails
    // off-grid (right edge); lower-left is the only viable position.
    const bag: BagItem[] = [
      place('a', APPLE, 4, 0),
      place('b', DAGGER, 5, 0),
    ];
    const result = combineAnchorPosition(['a', 'b'], bag);
    expect(result?.direction).toBe('lower-left');
    expect(result?.fallback).toBe(false);
  });

  it('skips upper-right when an item blocks the upper-right anchor zone', () => {
    // Cluster bounds (2..3, 1..1). Upper-right rect occupies cells (3,0)
    // and (4,0); placing an item at (4,0) blocks it. Upper-left clear.
    const bag: BagItem[] = [
      place('a', DAGGER, 2, 1),
      place('b', APPLE, 3, 1),
      place('blocker', WHET, 4, 0),
    ];
    const result = combineAnchorPosition(['a', 'b'], bag);
    expect(result?.direction).toBe('upper-left');
    expect(result?.fallback).toBe(false);
  });

  it('falls back to upper-right with overlap when all four anchors collide', () => {
    // Cluster at (2..3, 1..1). Block items in every anchor's rect zone:
    //   upper-right rect cells (3,0)+(4,0) → block (4,0)
    //   upper-left  rect cells (1,0)+(2,0) → block (1,0)
    //   lower-right rect cells (3,2)+(4,2) → block (4,2)
    //   lower-left  rect cells (1,2)+(2,2) → block (1,2)
    const bag: BagItem[] = [
      place('a', DAGGER, 2, 1),
      place('b', APPLE, 3, 1),
      place('block_ur', WHET, 4, 0),
      place('block_ul', SPARK, 1, 0),
      place('block_lr', COIN, 4, 2),
      place('block_ll', HERB, 1, 2),
    ];
    const result = combineAnchorPosition(['a', 'b'], bag);
    expect(result?.fallback).toBe(true);
    expect(result?.direction).toBe('upper-right');
  });
});

describe('computeBagLayout — M1.4a BagLayout handshake', () => {
  const DIMS: BagDimensions = { width: 6, height: 4 };
  const ORIGIN = { x: 100, y: 200 };
  const PLAYER_PORTRAIT = { x: 320, y: 360 };
  const GHOST_PORTRAIT = { x: 960, y: 360 };

  function buildInput(playerBag: BagItem[], cellSize = 88) {
    return {
      playerBagItems: playerBag,
      cellSize,
      playerBagOriginPx: ORIGIN,
      dimensions: DIMS,
      playerPortraitAnchor: PLAYER_PORTRAIT,
      ghostPortraitAnchor: GHOST_PORTRAIT,
    };
  }

  it('places a single 1×1 item at the pixel center of its anchor cell + bag origin', () => {
    const bag = [place('p1', HERB, 0, 0)];
    const layout = computeBagLayout(buildInput(bag));
    // Cell (0,0) center bag-local = (44, 44); + origin (100, 200) = (144, 244).
    expect(layout.player.itemAnchors.get('p1' as PlacementId)).toEqual({ x: 144, y: 244 });
  });

  it('uses anchor-cell center for multi-cell items, NOT bbox center', () => {
    // DAGGER's footprint is multi-cell; the item is anchored at (col=2,
    // row=1). computeBagLayout reads (col, row) directly — anchor stays
    // at the (2,1) cell center regardless of footprint. Bag-local
    // anchor = (2.5 × 88, 1.5 × 88) = (220, 132); + origin = (320, 332).
    const bag = [place('p2', DAGGER, 2, 1)];
    const layout = computeBagLayout(buildInput(bag));
    expect(layout.player.itemAnchors.get('p2' as PlacementId)).toEqual({ x: 320, y: 332 });
  });

  it('rotation does not move the anchor (rot is irrelevant to the anchor cell)', () => {
    // Same item at (3, 2) with rot=90 — anchor still at cell (3,2) center.
    // Bag-local = (3.5 × 88, 2.5 × 88) = (308, 220); + origin = (408, 420).
    const bag = [place('p3', DAGGER, 3, 2)];
    bag[0]!.rot = 90;
    const layout = computeBagLayout(buildInput(bag));
    expect(layout.player.itemAnchors.get('p3' as PlacementId)).toEqual({ x: 408, y: 420 });
  });

  it('matches combineAnchorPosition\'s frame: bag-local origin at (0,0) → cell (0,0) center is (cellSize/2, cellSize/2)', () => {
    // Sanity-check: with origin at (0,0) and cellSize 88, cell (0,0)
    // center sits at (44, 44) — same frame combineAnchorPosition computes
    // against (col * cellSize for cell top-left x).
    const bag = [place('p4', HERB, 0, 0)];
    const layout = computeBagLayout({ ...buildInput(bag), playerBagOriginPx: { x: 0, y: 0 } });
    expect(layout.player.itemAnchors.get('p4' as PlacementId)).toEqual({ x: 44, y: 44 });
  });

  it('ghost.itemAnchors is always empty (M1 contract — no ghost bag DOM)', () => {
    const bag = [place('p5', HERB, 0, 0), place('p6', SPARK, 1, 1)];
    const layout = computeBagLayout(buildInput(bag));
    expect(layout.ghost.itemAnchors.size).toBe(0);
  });

  it('propagates cellSize, dimensions, and portrait anchors verbatim', () => {
    const bag: BagItem[] = [];
    const layout = computeBagLayout(buildInput(bag, 52));
    expect(layout.cellSize).toBe(52);
    expect(layout.dimensions).toBe(DIMS);
    expect(layout.player.portraitAnchor).toEqual(PLAYER_PORTRAIT);
    expect(layout.ghost.portraitAnchor).toEqual(GHOST_PORTRAIT);
  });

  it('is pure: same input → same output (deep-equal across two invocations)', () => {
    const bag = [place('p7', HERB, 1, 2), place('p8', DAGGER, 4, 3)];
    const layout1 = computeBagLayout(buildInput(bag));
    const layout2 = computeBagLayout(buildInput(bag));
    expect(layout1.cellSize).toBe(layout2.cellSize);
    expect(Array.from(layout1.player.itemAnchors.entries())).toEqual(
      Array.from(layout2.player.itemAnchors.entries()),
    );
  });

  it('mobile cellSize (52) produces correctly-scaled anchor positions', () => {
    const bag = [place('p9', HERB, 1, 1)];
    const layout = computeBagLayout(buildInput(bag, 52));
    // (1.5 × 52, 1.5 × 52) = (78, 78); + origin (100, 200) = (178, 278).
    expect(layout.player.itemAnchors.get('p9' as PlacementId)).toEqual({ x: 178, y: 278 });
  });
});
