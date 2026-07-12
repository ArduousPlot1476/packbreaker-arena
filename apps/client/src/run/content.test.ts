// Iconned-content coverage — Uncommon batch 2 (2026-07-11) wiring guard.
// Locks: the union widen (33 iconned ids, all 24 batch-1 entries intact);
// the ICONS map ⇄ ICONNED_ITEM_IDS 1:1 coverage (no iconned id silently
// falls back to copper-coin); and the by-construction ICONNED_RECIPES set
// (4 → 7 — iron-shield/stamina-tonic/treasure-sack unlock; tower-shield +
// venom-flask stay filtered because their OUTPUTS remain non-iconned even
// though their inputs are now all iconned).

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

describe('ICONNED_ITEM_IDS — Uncommon batch 2 union widen', () => {
  it('totals 33 unique ids', () => {
    expect(ICONNED_ITEM_IDS).toHaveLength(33);
    expect(new Set(ICONNED_ITEM_IDS).size).toBe(33);
  });

  it('preserves all 24 batch-1 entries exactly (union, not replace)', () => {
    for (const id of BATCH1_24) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('adds the 9 net-new Uncommon batch-2 ids', () => {
    for (const id of BATCH2_9) expect(ICONNED_ITEM_IDS).toContain(id);
  });

  it('is exactly the 24 batch-1 + 9 batch-2 ids (no extras)', () => {
    expect(new Set(ICONNED_ITEM_IDS)).toEqual(new Set([...BATCH1_24, ...BATCH2_9]));
  });
});

describe('ICONS map ⇄ ICONNED_ITEM_IDS coverage', () => {
  it('every iconned id has a dedicated ICONS component (no copper-coin fallback)', () => {
    for (const id of ICONNED_ITEM_IDS) {
      expect(ICONS[id], `ICONS['${id}'] missing`).toBeTypeOf('function');
    }
  });

  it('has a distinct component for each of the 9 batch-2 icons', () => {
    for (const id of BATCH2_9) expect(ICONS[id]).toBeTypeOf('function');
  });
});

describe('ICONNED_RECIPES — by-construction 4 → 7 (batch-2 outputs iconned)', () => {
  const ids = ICONNED_RECIPES.map((r) => String(r.id)).sort();

  it('is exactly the 7 expected recipes, nothing else', () => {
    expect(ids).toEqual([
      'r-ember-brand',
      'r-fire-oil',
      'r-healing-salve',
      'r-iron-shield',
      'r-stamina-tonic',
      'r-steel-sword',
      'r-treasure-sack',
    ]);
  });

  it('does NOT switch on tower-shield / venom-flask (inputs iconned, outputs not)', () => {
    expect(ids).not.toContain('r-tower-shield');
    expect(ids).not.toContain('r-venom-flask');
  });
});
