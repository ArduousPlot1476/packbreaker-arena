// relicOffer.test.ts — M1.5a PR 3 Phase 2a unit tests for the mid/boss
// relic offer generators.
//
// Coverage: determinism (same-seed identity, cross-call independence),
// class filter (mid + boss × Tinker + Marauder), length caps (matching
// M1 content shipment of 2 mid / 1 boss per class), and seed-effect
// (different seeds → potentially different presentation orders for mid).

import { describe, expect, it } from 'vitest';
import { ClassId, RELICS, RelicId, SimSeed, type Relic } from '@packbreaker/content';
import {
  RELIC_OFFER_STRIDE,
  generateBossRelicOffer,
  generateMidRelicOffer,
} from '../src/run/relicOffer';

const TINKER = ClassId('tinker');
const MARAUDER = ClassId('marauder');

function relicById(id: RelicId): Relic {
  const r = RELICS[id];
  if (!r) throw new Error(`relicById: unknown relic ${String(id)}`);
  return r;
}

describe('RELIC_OFFER_STRIDE', () => {
  it('is the take-2 Q6 ratified value (65519)', () => {
    expect(RELIC_OFFER_STRIDE).toBe(65519);
  });
});

describe('generateMidRelicOffer', () => {
  it('determinism — same (runSeed, classId) yields identical output across repeat calls', () => {
    const seed = SimSeed(42);
    const a = generateMidRelicOffer(seed, TINKER);
    const b = generateMidRelicOffer(seed, TINKER);
    expect(a).toEqual(b);
  });

  it('class filter — Tinker result is subset of mid relics with classAffinity in {TINKER, null}', () => {
    const offer = generateMidRelicOffer(SimSeed(1), TINKER);
    for (const id of offer) {
      const relic = relicById(id);
      expect(relic.slot).toBe('mid');
      expect(relic.classAffinity === TINKER || relic.classAffinity === null).toBe(true);
    }
  });

  it('class filter — Marauder result is subset of mid relics with classAffinity in {MARAUDER, null}', () => {
    const offer = generateMidRelicOffer(SimSeed(1), MARAUDER);
    for (const id of offer) {
      const relic = relicById(id);
      expect(relic.slot).toBe('mid');
      expect(relic.classAffinity === MARAUDER || relic.classAffinity === null).toBe(true);
    }
  });

  it('length cap — Tinker mid offer ≤ 2 per M1 content (resonant-anchor + catalyst)', () => {
    const offer = generateMidRelicOffer(SimSeed(7), TINKER);
    expect(offer.length).toBeLessThanOrEqual(2);
    expect(offer.length).toBe(2);
    expect([...offer].sort()).toEqual(['catalyst', 'resonant-anchor']);
  });

  it('length cap — Marauder mid offer ≤ 2 per M1 content (berserkers-pendant + crimson-pact)', () => {
    const offer = generateMidRelicOffer(SimSeed(7), MARAUDER);
    expect(offer.length).toBeLessThanOrEqual(2);
    expect(offer.length).toBe(2);
    expect([...offer].sort()).toEqual(['berserkers-pendant', 'crimson-pact']);
  });

  it('seed effect — different seeds preserve length + element set; presentation order may differ', () => {
    // With 2 elements per class, there are exactly 2 possible orderings.
    // Scan 10 distinct seeds; at least one pair must yield different
    // orders (otherwise the seed-derived shuffle is broken — orderings
    // would be constant regardless of input).
    const orders = new Set<string>();
    for (let s = 1; s <= 10; s++) {
      const offer = generateMidRelicOffer(SimSeed(s), TINKER);
      // Set-equality invariant: always the same 2-element eligible set,
      // regardless of order.
      expect([...offer].sort()).toEqual(['catalyst', 'resonant-anchor']);
      orders.add(offer.join(','));
    }
    // Multiple distinct orderings observed → seed actually affects order.
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe('generateBossRelicOffer', () => {
  it('determinism — same (runSeed, classId) yields identical output across repeat calls', () => {
    const seed = SimSeed(42);
    const a = generateBossRelicOffer(seed, TINKER);
    const b = generateBossRelicOffer(seed, TINKER);
    expect(a).toEqual(b);
  });

  it('class filter — Tinker result is subset of boss relics with classAffinity === TINKER (exact)', () => {
    const offer = generateBossRelicOffer(SimSeed(1), TINKER);
    for (const id of offer) {
      const relic = relicById(id);
      expect(relic.slot).toBe('boss');
      expect(relic.classAffinity).toBe(TINKER);
    }
  });

  it('class filter — Marauder result is subset of boss relics with classAffinity === MARAUDER (exact)', () => {
    const offer = generateBossRelicOffer(SimSeed(1), MARAUDER);
    for (const id of offer) {
      const relic = relicById(id);
      expect(relic.slot).toBe('boss');
      expect(relic.classAffinity).toBe(MARAUDER);
    }
  });

  it('length cap — Tinker boss offer ≤ 1 per M1 content (worldforge-seed)', () => {
    const offer = generateBossRelicOffer(SimSeed(7), TINKER);
    expect(offer.length).toBeLessThanOrEqual(1);
    expect(offer.length).toBe(1);
    expect(offer[0]).toBe('worldforge-seed');
  });

  it('length cap — Marauder boss offer ≤ 1 per M1 content (conquerors-crown)', () => {
    const offer = generateBossRelicOffer(SimSeed(7), MARAUDER);
    expect(offer.length).toBeLessThanOrEqual(1);
    expect(offer.length).toBe(1);
    expect(offer[0]).toBe('conquerors-crown');
  });
});

describe('cross-generator determinism (no collision via shared stride)', () => {
  it('order-of-call independence — interleaving mid + boss calls does not affect either output', () => {
    const seed = SimSeed(12345);
    // Forward order:
    const mid1 = generateMidRelicOffer(seed, TINKER);
    const boss1 = generateBossRelicOffer(seed, TINKER);
    // Reversed order:
    const boss2 = generateBossRelicOffer(seed, TINKER);
    const mid2 = generateMidRelicOffer(seed, TINKER);
    expect(mid1).toEqual(mid2);
    expect(boss1).toEqual(boss2);
  });
});
