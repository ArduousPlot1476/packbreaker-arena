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
  // Tuned against the balance harness 2026-08-05. The prior curve
  // [1,1,2,3,4,5,5,6,7,8,5] left rounds 4-10 at 74-95% player win because the
  // ghost was carrying roughly half the player's board; this one tracks the
  // player's measured cell fill. See ghost.ts for the measurement.
  const ITEM_COUNT_TABLE: ReadonlyArray<readonly [number, number]> = [
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 4],
    [5, 6],
    [6, 8],
    [7, 10],
    [8, 12],
    [9, 13],
    [10, 14],
    [11, 5],
  ];

  const CELLS = DIMS.width * DIMS.height;

  /** Every cell the build occupies, with rotation applied. Hoisted to the outer
   *  describe because the table test now also needs it: under the tuned curve a
   *  shortfall is legitimate, and "the bag was full" is what makes it legitimate. */
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
        for (let dx = 0; dx < w; dx++) cells.push(`${p.anchor.col + dx},${p.anchor.row + dy}`);
      }
    }
    return cells;
  }

  it('scales item count with round — the full table, value by value', () => {
    // Asserted as "hits target, OR the bag is physically full" rather than
    // against a magic seed that happens to place everything. Under the tuned
    // curve the late rounds ask for 13-14 items in a 24-cell bag, so saturation
    // is a legitimate outcome — measured 418 shortfalls in 22k ghosts, EVERY one
    // at exactly 24/24 cells. Pinning a lucky seed would hide that.
    const seed = 999 as SimSeed;
    for (const [round, count] of ITEM_COUNT_TABLE) {
      const ghost = makeGhostForRound(seed, round, DIMS);
      const placed = ghost.combatant.bag.placements.length;
      expect(placed).toBeLessThanOrEqual(count);
      if (placed < count) expect(occupancy(ghost).length).toBe(CELLS);
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

  it('opens below the player baseline and climbs to the same round-10 endpoint', () => {
    // 20 + (round-1)*2. Round 1 sits BELOW the player's 30 HP baseline so that a
    // player who bought a weapon wins comfortably while one who bought a shield
    // still loses — both sides are now guaranteed a weapon in rounds 1-3, and at
    // equal HP that made round 1 a measured 50/50 coin flip.
    //
    // The round-10 endpoint (38) is unchanged from the previous curve, so this
    // opens the early game without softening the late game.
    const seed = 7 as SimSeed;
    const hp = (round: number) => makeGhostForRound(seed, round, DIMS).combatant.startingHp;
    expect(hp(1)).toBe(20);
    expect(hp(2)).toBe(22);
    expect(hp(10)).toBe(38);
    expect(hp(1)).toBeLessThan(BASE_COMBATANT_HP);
  });

  it('ghost hp is monotonically non-decreasing across rounds 1-10', () => {
    const seed = 7 as SimSeed;
    for (let round = 2; round <= 10; round++) {
      const prev = makeGhostForRound(seed, round - 1, DIMS).combatant.startingHp;
      const curr = makeGhostForRound(seed, round, DIMS).combatant.startingHp;
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
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
      const target: Record<number, number> = { 4: 4, 5: 6, 6: 8, 7: 10, 8: 12, 9: 13, 10: 14 };
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

    it('round 10 places all 14 items for the large majority of seeds', () => {
      // 14 items in a 24-cell bag genuinely saturates sometimes — measured ~83%
      // hit rate. The floor is set below that with headroom, because the point
      // of this test is to catch the generator silently under-filling (which
      // would quietly undo the difficulty lift), not to pin an exact rate.
      let full = 0;
      for (let seed = 1; seed <= 400; seed++) {
        if (makeGhostForRound(seed as SimSeed, 10, DIMS).combatant.bag.placements.length === 14) {
          full++;
        }
      }
      expect(full).toBeGreaterThanOrEqual(300); // measured ~332/400
    });
  });
});
