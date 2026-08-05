import { describe, expect, it } from 'vitest';
import { ITEMS as CONTENT_ITEMS, type Item, type ItemId } from '@packbreaker/content';
import { dealsDamage, guaranteedDamageBeforeRamp, isResolver, resolverIds } from './resolvers';
import { SHOP_OFFER_ITEMS } from './content';

const item = (id: string): Item => CONTENT_ITEMS[id as ItemId]!;

describe('guaranteedDamageBeforeRamp — measured against the shipped roster', () => {
  // These are the numbers the balance harness measured, restated as assertions
  // so a content edit that changes them fails loudly instead of silently moving
  // the early game.
  it.each([
    ['iron-sword', 40], // 4 dmg × floor(500/50)
    ['wooden-club', 40], // 5 × floor(500/60) = 5 × 8
    ['hand-axe', 36], // 3 × floor(500/40) = 3 × 12
    ['iron-dagger', 32], // 2 × floor(500/30) = 2 × 16
    ['iron-mace', 20], // 2 × 10 — a DECOY, cannot kill 30 HP
    ['throwing-knife', 8], // once — a DECOY
  ])('%s deals %i before the ramp', (id, expected) => {
    expect(guaranteedDamageBeforeRamp(item(id))).toBe(expected);
  });

  it('counts conditional triggers as zero', () => {
    // wooden-shield heals on_taken_damage; bandage heals on_low_health. Neither
    // can start anything, which is the whole point — in the degenerate case this
    // predicate guards, nothing else is happening for them to react to.
    expect(guaranteedDamageBeforeRamp(item('wooden-shield'))).toBe(0);
    expect(guaranteedDamageBeforeRamp(item('bandage'))).toBe(0);
    // whetstone buffs an adjacent weapon — worth nothing with no weapon adjacent.
    expect(guaranteedDamageBeforeRamp(item('whetstone'))).toBe(0);
  });
});

describe('isResolver separates weapons from decoys', () => {
  it('accepts exactly the four Commons that can win round 1', () => {
    const commons = Object.keys(SHOP_OFFER_ITEMS).filter(
      (id) => SHOP_OFFER_ITEMS[id]!.rarity === 'common',
    );
    expect(commons).toHaveLength(20);
    const resolving = commons.filter((id) => isResolver(SHOP_OFFER_ITEMS[id]!)).sort();
    expect(resolving).toEqual(['hand-axe', 'iron-dagger', 'iron-sword', 'wooden-club']);
  });

  it('rejects the two decoys, which BOTH carry the weapon tag', () => {
    // This is the trap a tag-based or effect-presence test falls into: both read
    // as weapons on the shop card and neither can end a fight.
    for (const id of ['iron-mace', 'throwing-knife']) {
      expect(item(id).tags).toContain('weapon');
      expect(dealsDamage(item(id))).toBe(true);
      expect(isResolver(item(id))).toBe(false);
    }
  });

  it('14 of 20 Commons deal no damage whatsoever', () => {
    const commons = Object.keys(SHOP_OFFER_ITEMS).filter(
      (id) => SHOP_OFFER_ITEMS[id]!.rarity === 'common',
    );
    expect(commons.filter((id) => !dealsDamage(SHOP_OFFER_ITEMS[id]!))).toHaveLength(14);
  });
});

describe('resolverIds', () => {
  it('is sorted, so a seeded pick is reproducible', () => {
    const ids = resolverIds(SHOP_OFFER_ITEMS);
    expect([...ids].sort()).toEqual([...ids]);
  });

  it('finds resolvers across every rarity, not just Commons', () => {
    // The guarantee applies to early rounds, which are common-gated — but the
    // predicate must not be accidentally common-only, or a later use of it
    // silently finds nothing.
    const ids = resolverIds(SHOP_OFFER_ITEMS);
    expect(ids.length).toBeGreaterThan(4);
  });

  it('is non-empty — a vacuous guarantee is worse than none', () => {
    expect(resolverIds(SHOP_OFFER_ITEMS).length).toBeGreaterThan(0);
  });
});
