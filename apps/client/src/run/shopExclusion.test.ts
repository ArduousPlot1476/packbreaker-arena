// CF 66 — boss-reward-only shop/ghost exclusion (world-forged-heart). HARD MERGE GATE.
//
// world-forged-heart is a Legendary that is iconned + registered in
// SHOP_POOL_ITEMS (so combat + cost/resolution lookups resolve it) but is
// boss-reward-only (balance-bible.md § 10). The sim's buildPool rarity gate
// reaches 'legendary' at round 11, so once iconned it would become PURCHASABLE
// there unless excluded. SHOP_EXCLUDED_ITEM_IDS holds it out of the shop OFFER
// (SHOP_OFFER_ITEMS) and the ghost pool — applied at the client pool-generation
// sites, NOT the sim's buildPool (which is shared with the DO-NOT-REGENERATE
// determinism harness; excluding there would churn the round-11 fixtures). This
// suite is the merge gate (decision-log.md 2026-07-12 § "Legendary batch (batch 5,
// FINAL) icon artifact ratified"): world-forged-heart must be ABSENT from a
// generated round-11 shop AND round-11 ghost builds.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULESET,
  type BagDimensions,
  type ClassId,
  type SimSeed,
} from '@packbreaker/content';
import {
  SHOP_EXCLUDED_ITEM_IDS,
  SHOP_OFFER_ITEMS,
  SHOP_POOL_ITEMS,
} from './content';
import { generateShop } from '../shop/ShopController';
import { makeGhostForRound } from '../combat/ghost';

const WFH = 'world-forged-heart';
const DIMS: BagDimensions = { width: 6, height: 4 };
const CLASSES: ClassId[] = ['marauder' as ClassId, 'tinker' as ClassId];

describe('CF 66 — world-forged-heart shop/ghost exclusion (data level)', () => {
  it('is registered in SHOP_POOL_ITEMS so combat/cost lookups still resolve it', () => {
    expect(WFH in SHOP_POOL_ITEMS).toBe(true);
  });

  it('is legendary — round-11 rarity-gate-eligible, so its absence is the exclusion, not the gate', () => {
    expect(SHOP_POOL_ITEMS[WFH]!.rarity).toBe('legendary');
  });

  it('is in SHOP_EXCLUDED_ITEM_IDS and absent from SHOP_OFFER_ITEMS', () => {
    expect(SHOP_EXCLUDED_ITEM_IDS.has(WFH)).toBe(true);
    expect(WFH in SHOP_OFFER_ITEMS).toBe(false);
  });

  it('SHOP_OFFER_ITEMS = SHOP_POOL_ITEMS minus exactly the exclusions', () => {
    for (const id of Object.keys(SHOP_POOL_ITEMS)) {
      expect(id in SHOP_OFFER_ITEMS).toBe(!SHOP_EXCLUDED_ITEM_IDS.has(id));
    }
  });
});

describe('CF 66 — HARD GATE: absent from round-11 shop + ghost builds', () => {
  it('never offers world-forged-heart in a round-11 shop (200 seeds × 2 classes × 3 rerolls)', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const classId of CLASSES) {
        for (let reroll = 0; reroll < 3; reroll++) {
          const slots = generateShop(seed as SimSeed, 11, classId, DEFAULT_RULESET, reroll);
          expect(slots.some((s) => s.itemId === WFH)).toBe(false);
        }
      }
    }
  });

  it('never places world-forged-heart in a round-11 ghost build (200 seeds)', () => {
    for (let seed = 0; seed < 200; seed++) {
      const ghost = makeGhostForRound(seed as SimSeed, 11, DIMS);
      expect(ghost.combatant.bag.placements.some((p) => p.itemId === WFH)).toBe(false);
    }
  });
});
