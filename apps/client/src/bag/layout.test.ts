// Unit tests for combineAnchorPosition's four-direction first-fit
// algorithm (M0 deferred item 1 closure). Covers each direction
// winning, plus the dense-bag degenerate case where all four collide.

import { describe, expect, it } from 'vitest';
import type { BagItem, ItemId } from '../data.local';
import { combineAnchorPosition } from './layout';

function place(uid: string, itemId: ItemId, col: number, row: number): BagItem {
  return { uid, itemId, col, row, rot: 0 };
}

// All items used in these tests are 1×1 — single-cell occupancy keeps
// the cluster-bounds and collision math straightforward to reason about.
const HERB: ItemId = 'healing-herb';
const SPARK: ItemId = 'spark-stone';
const WHET: ItemId = 'whetstone';
const APPLE: ItemId = 'apple';
const COIN: ItemId = 'copper-coin';
const DAGGER: ItemId = 'iron-dagger';

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
