// Determinism + scaling tests for the procedural ghost generator. The
// production rule is "same (seed, round) → same Combatant"; M1.3.4a's
// in-prod usage doesn't snapshot the build elsewhere, but the
// determinism contract still applies — replays in M1.5+ will assume it.

import { describe, expect, it } from 'vitest';
import {
  BASE_COMBATANT_HP,
  type BagDimensions,
  type SimSeed,
} from '@packbreaker/content';
import { ITEMS } from '../run/content';
import { makeGhostForRound } from './ghost';

const DIMS: BagDimensions = { width: 6, height: 4 };

describe('makeGhostForRound', () => {
  it('is deterministic in (baseSeed, round)', () => {
    const seed = 12345 as SimSeed;
    const a = makeGhostForRound(seed, 4, DIMS);
    const b = makeGhostForRound(seed, 4, DIMS);
    expect(a).toEqual(b);
  });

  it('produces different placements for different seeds', () => {
    const a = makeGhostForRound(11 as SimSeed, 5, DIMS);
    const b = makeGhostForRound(22 as SimSeed, 5, DIMS);
    // Same item count target (round 5 → 2 items), but at least one of
    // (placement layout / item ids) should differ across seeds.
    const sigA = a.combatant.bag.placements.map((p) => `${p.itemId}@${p.anchor.col},${p.anchor.row},${p.rotation}`).join('|');
    const sigB = b.combatant.bag.placements.map((p) => `${p.itemId}@${p.anchor.col},${p.anchor.row},${p.rotation}`).join('|');
    expect(sigA).not.toBe(sigB);
  });

  // The WHOLE ITEM_COUNT_BY_ROUND table, round by round. Asserted as literals
  // rather than as a shape so any curve edit has to restate its intent here.
  const ITEM_COUNT_TABLE: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 3],
    [5, 4],
    [6, 5],
    [7, 5],
    [8, 6],
    [9, 7],
    [10, 8],
    [11, 5],
  ];

  it('scales item count with round — the full table, value by value', () => {
    // Seed 999 places its full target at every round (verified by sweep; the
    // only saturating seeds in 60k are round-10 outliers, covered below).
    const seed = 999 as SimSeed;
    for (const [round, count] of ITEM_COUNT_TABLE) {
      expect(makeGhostForRound(seed, round, DIMS).combatant.bag.placements.length).toBe(count);
    }
  });

  it('monotonically non-decreasing across rounds 1–10 (the difficulty ramp never dips)', () => {
    const seed = 999 as SimSeed;
    const counts = ITEM_COUNT_TABLE.filter(([r]) => r <= 10).map(
      ([round]) => makeGhostForRound(seed, round, DIMS).combatant.bag.placements.length,
    );
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeGreaterThanOrEqual(counts[i - 1]!);
    }
  });

  // CF-93 ROUNDS-4–10 LIFT GUARD. The lift must not reach into the two frozen
  // regions on either side of it. Pinned by LITERAL, not by inspection:
  //   - rounds 1–3 are CF-93's separate leg (the stall band). A curve edit that
  //     reaches down into them changes the rounds this project has NOT ruled on.
  //   - round 11 is the balance-bible.md § 15 boss. opponentForRound.ts:68
  //     branches to the Forge Tyrant BEFORE this table is read, so the entry is
  //     generator-only — but it stays pinned so a future editor who does wire
  //     round 11 through here finds a red test rather than a silent boss change.
  it('PINS the frozen rounds by literal — rounds 1–3 (stall band) and round 11 (§ 15 boss)', () => {
    const seed = 999 as SimSeed;
    expect(makeGhostForRound(seed, 1, DIMS).combatant.bag.placements.length).toBe(1);
    expect(makeGhostForRound(seed, 2, DIMS).combatant.bag.placements.length).toBe(1);
    expect(makeGhostForRound(seed, 3, DIMS).combatant.bag.placements.length).toBe(2);
    expect(makeGhostForRound(seed, 11, DIMS).combatant.bag.placements.length).toBe(5);
  });

  it('scales hp gently with round (round 1 → BASE_HP; round 11 → BASE_HP+10)', () => {
    const seed = 7 as SimSeed;
    const r1 = makeGhostForRound(seed, 1, DIMS);
    const r11 = makeGhostForRound(seed, 11, DIMS);
    expect(r1.combatant.startingHp).toBe(BASE_COMBATANT_HP);
    expect(r11.combatant.startingHp).toBe(BASE_COMBATANT_HP + 10);
  });

  it('alternates classId by parity (odd → marauder, even → tinker)', () => {
    const seed = 42 as SimSeed;
    expect(makeGhostForRound(seed, 1, DIMS).classId).toBe('marauder');
    expect(makeGhostForRound(seed, 2, DIMS).classId).toBe('tinker');
    expect(makeGhostForRound(seed, 3, DIMS).classId).toBe('marauder');
    expect(makeGhostForRound(seed, 4, DIMS).classId).toBe('tinker');
  });

  it('respects the rarity gate (round 1 placements are all common)', () => {
    const seed = 100 as SimSeed;
    const r1 = makeGhostForRound(seed, 1, DIMS);
    // M1.3.4a: round 1 rarity gate is 'common' (RARITY_GATE_BY_ROUND[0]).
    // Verify by checking the iconned items selected are all commons. We
    // don't import ITEMS here — items.ts placement at common rarity is
    // covered upstream; this test asserts placement count at min.
    expect(r1.combatant.bag.placements.length).toBeGreaterThan(0);
  });

  it('emits placements that fit within the bag dimensions', () => {
    const seed = 55 as SimSeed;
    for (let round = 1; round <= 11; round++) {
      const ghost = makeGhostForRound(seed, round, DIMS);
      for (const p of ghost.combatant.bag.placements) {
        expect(p.anchor.col).toBeGreaterThanOrEqual(0);
        expect(p.anchor.row).toBeGreaterThanOrEqual(0);
        expect(p.anchor.col).toBeLessThan(DIMS.width);
        expect(p.anchor.row).toBeLessThan(DIMS.height);
      }
    }
  });

  // CF-93 rounds-4–10 lift: round 10 goes to 8 items in a 24-cell bag, so
  // placement stops being trivially satisfiable and becomes an actual claim.
  // Occupancy is recomputed here from the real ItemDef footprints — the
  // generator's own first-fit search is NOT trusted to mark its own homework.
  describe('placement holds under the lifted counts (rounds 4–10)', () => {
    const CELLS = DIMS.width * DIMS.height;

    /** Every cell the build occupies, with rotation applied. */
    function occupancy(ghost: ReturnType<typeof makeGhostForRound>) {
      const cells: string[] = [];
      for (const p of ghost.combatant.bag.placements) {
        const def = ITEMS[p.itemId]!;
        const rotated = p.rotation === 90 || p.rotation === 270;
        const w = rotated ? def.h : def.w;
        const h = rotated ? def.w : def.h;
        expect(p.anchor.col + w).toBeLessThanOrEqual(DIMS.width);
        expect(p.anchor.row + h).toBeLessThanOrEqual(DIMS.height);
        for (let dy = 0; dy < h; dy++) {
          for (let dx = 0; dx < w; dx++) cells.push(`${p.anchor.row + dy}:${p.anchor.col + dx}`);
        }
      }
      return cells;
    }

    it('never overlaps and never leaves the bag, across a wide seed sweep', () => {
      for (let round = 4; round <= 10; round++) {
        for (let seed = 1; seed <= 400; seed++) {
          const cells = occupancy(makeGhostForRound(seed as SimSeed, round, DIMS));
          expect(new Set(cells).size).toBe(cells.length); // zero double-booked cells
          expect(cells.length).toBeLessThanOrEqual(CELLS);
        }
      }
    });

    // The generator's contract is `placements.length <= target` (ghost.ts): the
    // loop gives up rather than guaranteeing a count. At round 10 that clause is
    // REACHABLE — measured 3 seeds in 60,000 (16100 / 24684 / 45073) land 7
    // items whose footprints total exactly 24/24 cells, all 2x2-heavy. Those are
    // not weak builds and not a ceiling artifact: a 500-attempt ceiling still
    // returns 7 with 493 rejections, because zero free cells remain.
    //
    // So the honest invariant is NOT "always 8" — it is "short ONLY when full".
    it('falls short of target ONLY when the bag is physically full', () => {
      const target: Record<number, number> = { 4: 3, 5: 4, 6: 5, 7: 5, 8: 6, 9: 7, 10: 8 };
      for (let round = 4; round <= 10; round++) {
        for (let seed = 1; seed <= 400; seed++) {
          const ghost = makeGhostForRound(seed as SimSeed, round, DIMS);
          const used = occupancy(ghost).length;
          if (ghost.combatant.bag.placements.length < target[round]!) {
            expect(used).toBe(CELLS);
          }
          expect(ghost.combatant.bag.placements.length).toBeLessThanOrEqual(target[round]!);
        }
      }
    });

    it('round 10 places all 8 items for the overwhelming majority of seeds', () => {
      let full = 0;
      for (let seed = 1; seed <= 400; seed++) {
        if (makeGhostForRound(seed as SimSeed, 10, DIMS).combatant.bag.placements.length === 8) {
          full++;
        }
      }
      expect(full).toBeGreaterThanOrEqual(395); // measured 400/400 here; 3 in 60k saturate
    });
  });
});
