// Iconned-content coverage — Rare batch 3 (2026-07-11) wiring guard.
// Locks: the union widen (40 iconned ids, all 24 batch-1 + 9 batch-2 entries
// intact); the ICONS map ⇄ ICONNED_ITEM_IDS 1:1 coverage (no iconned id
// silently falls back to copper-coin); and the by-construction ICONNED_RECIPES
// set (7 → 10 — greatsword/tower-shield/venom-flask outputs now iconned unlock
// r-greatsword/r-tower-shield/r-venom-flask; the two Epic capstones stay
// filtered because their OUTPUTS remain non-iconned even though their inputs
// are now all iconned).

import { describe, expect, it } from 'vitest';
import { ICONNED_ITEM_IDS, ICONNED_RECIPES } from './content';
import { ICONS } from '../icons/icons';

const BATCH1_24 = [
  'iron-sword', 'iron-dagger', 'wooden-shield', 'healing-herb', 'spark-stone',
  'whetstone', 'apple', 'copper-coin', 'steel-sword', 'healing-salve', 'fire-oil',
  'ember-brand', 'wooden-club', 'hand-axe', 'iron-mace', 'throwing-knife',
  'buckler', 'leather-vest', 'iron-cap', 'bread', 'mana-potion', 'coin-pouch',
  'lucky-penny', 'bandage',
];

const BATCH2_9 = [
  'war-axe', 'crossbow', 'spear', 'iron-shield', 'chainmail', 'stamina-tonic',
  'poison-vial', 'frost-shard', 'treasure-sack',
];

const BATCH3_7 = [
  'greatsword', 'warhammer', 'vampire-fang', 'tower-shield', 'forge-anvil',
  'rune-pedestal', 'venom-flask',
];

describe('ICONNED_ITEM_IDS — Rare batch 3 union widen', () => {
  it('totals 40 unique ids', () => {
    expect(ICONNED_ITEM_IDS).toHaveLength(40);
    expect(new Set(ICONNED_ITEM_IDS).size).toBe(40);
  });

  it('preserves all 24 batch-1 entries exactly (union, not replace)', () => {
    for (const id of BATCH1_24) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('preserves all 9 batch-2 entries exactly (union, not replace)', () => {
    for (const id of BATCH2_9) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('adds the 7 net-new Rare batch-3 ids', () => {
    for (const id of BATCH3_7) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('is exactly the 24 batch-1 + 9 batch-2 + 7 batch-3 ids (no extras)', () => {
    expect(new Set(ICONNED_ITEM_IDS)).toEqual(
      new Set([...BATCH1_24, ...BATCH2_9, ...BATCH3_7]),
    );
  });
});

describe('ICONS map ⇄ ICONNED_ITEM_IDS coverage', () => {
  it('every iconned id has a dedicated ICONS component (no copper-coin fallback)', () => {
    for (const id of ICONNED_ITEM_IDS) {
      expect(ICONS[id], `ICONS['${id}'] missing`).toBeTypeOf('function');
    }
  });

  it('has a distinct component for each of the 7 batch-3 icons', () => {
    for (const id of BATCH3_7) expect(ICONS[id]).toBeTypeOf('function');
  });
});

describe('ICONNED_RECIPES — by-construction 7 → 10 (batch-3 outputs iconned)', () => {
  const ids = ICONNED_RECIPES.map((r) => String(r.id)).sort();

  it('is exactly the 10 expected recipes, nothing else', () => {
    expect(ids).toEqual([
      'r-ember-brand',
      'r-fire-oil',
      'r-greatsword',
      'r-healing-salve',
      'r-iron-shield',
      'r-stamina-tonic',
      'r-steel-sword',
      'r-tower-shield',
      'r-treasure-sack',
      'r-venom-flask',
    ]);
  });

  it('switches ON r-greatsword / r-tower-shield / r-venom-flask (batch-3 outputs now iconned)', () => {
    expect(ids).toContain('r-greatsword');
    expect(ids).toContain('r-tower-shield');
    expect(ids).toContain('r-venom-flask');
  });

  it('does NOT switch on the Epic capstones (inputs now all iconned, Epic outputs not)', () => {
    expect(ids).not.toContain('r-berserkers-greataxe');
    expect(ids).not.toContain('r-master-alchemists-kit');
  });
});
