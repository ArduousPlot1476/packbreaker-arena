// CF-85 Surface 2a — ghost-intent pure-module tests. Acceptance (anchor
// entry, Redraw item 1): the intent panel shows the REAL apparent class
// and REAL marquee items for the current round's ghost, changing
// round-to-round, never the full bag pre-combat (gdd.md § 14: 1–2 max).
//
// Rule 28 falsifiability (proven during Phase 2, output in the PR body):
// with the rarity-desc sort inverted, the rarity-ordering property test
// fails; restored byte-identical.

import { describe, expect, it } from 'vitest';
import { DEFAULT_RULESET, type BagPlacement, type PlacementId, type SimSeed } from '@packbreaker/content';
import { RARITY_RANK } from '../bag/layout';
import { ITEMS } from '../run/content';
import type { ItemId } from '../run/types';
import { makeGhostForRound } from './ghost';
import { MARQUEE_MAX, ghostIntentForRound, selectMarqueeItemIds } from './ghostIntent';

const DIMS = DEFAULT_RULESET.bagDimensions;
const SEED = 424242 as SimSeed;

function placement(placementId: string, itemId: string): BagPlacement {
  return {
    placementId: placementId as PlacementId,
    itemId: itemId as never,
    anchor: { col: 0, row: 0 },
    rotation: 0,
  };
}

describe('selectMarqueeItemIds (shape-pure: consumes BagPlacement[], no generator import)', () => {
  it('ranks by rarity descending', () => {
    // healing-herb / iron-sword are commons in the iconned set; pick a
    // higher-rarity partner from the registry dynamically so the test
    // does not hardcode a rarity table that content churn could move.
    const ids = Object.keys(ITEMS) as ItemId[];
    const common = ids.find((id) => ITEMS[id]!.rarity === 'common')!;
    const higher = ids.find((id) => RARITY_RANK[ITEMS[id]!.rarity] > RARITY_RANK['common'])!;
    const picked = selectMarqueeItemIds([placement('a', common), placement('b', higher)]);
    expect(picked[0]).toBe(higher);
    expect(picked[1]).toBe(common);
  });

  it('dedupes by itemId — two placements of the same item are one silhouette', () => {
    const picked = selectMarqueeItemIds([
      placement('a', 'iron-sword'),
      placement('b', 'iron-sword'),
      placement('c', 'healing-herb'),
    ]);
    expect(picked).toHaveLength(2);
    expect(new Set(picked).size).toBe(2);
  });

  it('caps at MARQUEE_MAX (gdd.md § 14: never the full bag pre-combat)', () => {
    const picked = selectMarqueeItemIds([
      placement('a', 'iron-sword'),
      placement('b', 'healing-herb'),
      placement('c', 'spark-stone'),
      placement('d', 'copper-coin'),
    ]);
    expect(picked.length).toBeLessThanOrEqual(MARQUEE_MAX);
    expect(MARQUEE_MAX).toBe(2);
  });

  it('empty placements → empty marquee (defensive)', () => {
    expect(selectMarqueeItemIds([])).toEqual([]);
  });
});

describe('ghostIntentForRound (the ONE sanctioned generator call for the intent panel)', () => {
  it('is deterministic: identical (seed, round, dims) → identical intent', () => {
    const a = ghostIntentForRound(SEED, 4, DIMS);
    const b = ghostIntentForRound(SEED, 4, DIMS);
    expect(a).toEqual(b);
  });

  it('marquee items are drawn from the REAL ghost placements for that round', () => {
    for (const round of [1, 3, 6, 9]) {
      const ghost = makeGhostForRound(SEED, round, DIMS);
      const intent = ghostIntentForRound(SEED, round, DIMS);
      const real = new Set(ghost.combatant.bag.placements.map((p) => p.itemId));
      for (const id of intent.marqueeItemIds) {
        expect(real.has(id as never)).toBe(true);
      }
      expect(intent.marqueeItemIds.length).toBeGreaterThan(0);
      expect(intent.marqueeItemIds.length).toBeLessThanOrEqual(MARQUEE_MAX);
    }
  });

  it('mirrors the real ghost class (round parity: odd → Marauder, even → Tinker)', () => {
    expect(ghostIntentForRound(SEED, 1, DIMS).classId).toBe('marauder');
    expect(ghostIntentForRound(SEED, 2, DIMS).classId).toBe('tinker');
    expect(ghostIntentForRound(SEED, 1, DIMS).classLabel).toBe('Marauder');
    expect(ghostIntentForRound(SEED, 2, DIMS).classLabel).toBe('Tinker');
  });

  it('changes round-to-round for a fixed seed (the acceptance "changing round-to-round")', () => {
    const r1 = ghostIntentForRound(SEED, 1, DIMS);
    const r2 = ghostIntentForRound(SEED, 2, DIMS);
    // Class parity alone guarantees a visible change between adjacent rounds.
    expect(r1.classId).not.toBe(r2.classId);
  });
});
