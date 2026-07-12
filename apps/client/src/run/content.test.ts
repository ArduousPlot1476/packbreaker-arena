// Iconned-content coverage — Legendary batch 5 (2026-07-12, FINAL) wiring guard.
// Locks: the union widen (45 iconned ids — COMPLETE, all 24 batch-1 + 9 batch-2
// + 7 batch-3 + 4 batch-4 entries intact); the ICONS map ⇄ ICONNED_ITEM_IDS 1:1
// coverage (no iconned id silently falls back to copper-coin); and that
// ICONNED_RECIPES stays 12/12 (world-forged-heart is in no recipe — neither
// output nor input — so iconning it adds no recipe). CF-66's shop/ghost
// exclusion of world-forged-heart is covered separately in shopExclusion.test.ts.

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

const BATCH4_4 = [
  'berserkers-greataxe', 'bloodmoon-plate', 'master-alchemists-kit',
  'resonance-crystal',
];

const BATCH5_1 = ['world-forged-heart'];

describe('ICONNED_ITEM_IDS — Legendary batch 5 union widen (45/45 COMPLETE)', () => {
  it('totals 45 unique ids', () => {
    expect(ICONNED_ITEM_IDS).toHaveLength(45);
    expect(new Set(ICONNED_ITEM_IDS).size).toBe(45);
  });

  it('preserves all 24 batch-1 entries exactly (union, not replace)', () => {
    for (const id of BATCH1_24) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('preserves all 9 batch-2 entries exactly (union, not replace)', () => {
    for (const id of BATCH2_9) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('preserves all 7 batch-3 entries exactly (union, not replace)', () => {
    for (const id of BATCH3_7) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('preserves all 4 batch-4 entries exactly (union, not replace)', () => {
    for (const id of BATCH4_4) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('adds the 1 net-new Legendary batch-5 id (world-forged-heart)', () => {
    for (const id of BATCH5_1) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('is exactly the 24 + 9 + 7 + 4 + 1 = 45 ids (no extras)', () => {
    expect(new Set(ICONNED_ITEM_IDS)).toEqual(
      new Set([...BATCH1_24, ...BATCH2_9, ...BATCH3_7, ...BATCH4_4, ...BATCH5_1]),
    );
  });
});

describe('ICONS map ⇄ ICONNED_ITEM_IDS coverage', () => {
  it('every iconned id has a dedicated ICONS component (no copper-coin fallback)', () => {
    for (const id of ICONNED_ITEM_IDS) {
      expect(ICONS[id], `ICONS['${id}'] missing`).toBeTypeOf('function');
    }
  });

  it('has a distinct component for the batch-5 Legendary icon (world-forged-heart)', () => {
    for (const id of BATCH5_1) expect(ICONS[id]).toBeTypeOf('function');
  });
});

describe('ICONNED_RECIPES — stays 12/12 (world-forged-heart adds no recipe)', () => {
  const ids = ICONNED_RECIPES.map((r) => String(r.id)).sort();

  it('is exactly the 12 expected recipes, nothing else', () => {
    expect(ids).toEqual([
      'r-berserkers-greataxe',
      'r-ember-brand',
      'r-fire-oil',
      'r-greatsword',
      'r-healing-salve',
      'r-iron-shield',
      'r-master-alchemists-kit',
      'r-stamina-tonic',
      'r-steel-sword',
      'r-tower-shield',
      'r-treasure-sack',
      'r-venom-flask',
    ]);
  });

  it('stays 12 — iconning world-forged-heart adds no recipe (it is in none)', () => {
    expect(ids).toHaveLength(12);
    expect(ids).not.toContain('r-world-forged-heart');
  });

  it('keeps the two Epic capstones on (r-berserkers-greataxe / r-master-alchemists-kit)', () => {
    expect(ids).toContain('r-berserkers-greataxe');
    expect(ids).toContain('r-master-alchemists-kit');
  });
});
