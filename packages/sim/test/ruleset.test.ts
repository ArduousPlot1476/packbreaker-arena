// ruleset.test.ts — CF-72 Phase 2 unit tests for trophyDeltaFor, the single
// trophy-award derivation shared by the sim's write branch and the client's
// pre-commit resolution panel (the CF-38 co-drift antidote).
//
// Coverage: the ratified win schedule at both ends of the round range, the flat
// loss penalty, and the floor-at-zero clamp edge — which is the case that
// separates "post-clamp actual delta" from "raw formula output" and the reason
// the display cannot simply re-state −5.
//
// Ratified at decision-log.md 2026-07-15 § "CF-72 Phase 1 RATIFIED" (formula)
// and § "CF-72 Phase 2 Step 0 halt" (shared-derivation mechanism).

import { describe, expect, it } from 'vitest';
import { trophyDeltaFor } from '../src/run/ruleset';

describe('trophyDeltaFor — win schedule (CF-72 ratified: 10 + 2 × (round − 1))', () => {
  it('round 1 win awards 10', () => {
    expect(trophyDeltaFor('win', 1, 0)).toBe(10);
  });

  it('round 11 (boss) win awards 30', () => {
    expect(trophyDeltaFor('win', 11, 0)).toBe(30);
  });

  it('scales by exactly 2 per round across the full round range', () => {
    const deltas = Array.from({ length: 11 }, (_, i) => trophyDeltaFor('win', i + 1, 0));
    expect(deltas).toEqual([10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
  });

  it('is independent of currentTrophy — the win branch never clamps', () => {
    // Strictly increasing, so floor-at-zero cannot bind on a win. Guards
    // against a future refactor accidentally routing wins through the clamp.
    expect(trophyDeltaFor('win', 5, 0)).toBe(trophyDeltaFor('win', 5, 9999));
  });
});

describe('trophyDeltaFor — loss penalty (CF-72 ratified: flat −5, floored at zero)', () => {
  it('returns a flat −5 when currentTrophy is comfortably above the penalty', () => {
    expect(trophyDeltaFor('loss', 3, 40)).toBe(-5);
  });

  it('returns −5 exactly at the boundary (currentTrophy === 5 → lands on 0)', () => {
    expect(trophyDeltaFor('loss', 3, 5)).toBe(-5);
  });

  it('returns the POST-CLAMP actual delta below the boundary (3 → −3, not −5)', () => {
    // The load-bearing case: the sim will move trophy 3 → 0, so the panel must
    // announce −3. A display re-stating a flat −5 would co-drift here (CF-38).
    expect(trophyDeltaFor('loss', 3, 3)).toBe(-3);
  });

  it('returns 0 at trophy 0 — floor already reached, nothing to subtract', () => {
    expect(trophyDeltaFor('loss', 3, 0)).toBe(0);
  });

  it('never drives the persistent trophy below zero across the clamp range', () => {
    for (let trophy = 0; trophy <= 10; trophy++) {
      expect(trophy + trophyDeltaFor('loss', 4, trophy)).toBeGreaterThanOrEqual(0);
    }
  });

  it('is independent of round — the ratified loss penalty is flat', () => {
    expect(trophyDeltaFor('loss', 1, 40)).toBe(trophyDeltaFor('loss', 11, 40));
  });
});
