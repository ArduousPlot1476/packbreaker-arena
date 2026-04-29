// triggers.test.ts — TriggerState verbs for the M1.2.3b combat resolver.
//
// Mirrors status.test.ts in style: the verbs in isolation, no resolver. The
// resolver in M1.2.3b will test these verbs in concert with the rest of the
// tick. Coverage target on triggers.ts: 100% line / 100% branch.

import { describe, expect, it } from 'vitest';
import { PlacementId } from '@packbreaker/content';
import {
  accumulateCooldown,
  createTriggerState,
  isFiringCapped,
  recordFire,
  shouldFire,
  type TriggerKey,
} from '../src/triggers';

const k = (id: string, idx: number): TriggerKey => ({
  placementId: PlacementId(id),
  triggerIndex: idx,
});

describe('createTriggerState', () => {
  it('produces an empty entries map', () => {
    const s = createTriggerState();
    expect(s.entries).toEqual({});
    expect(Object.keys(s.entries).length).toBe(0);
  });
});

describe('accumulateCooldown', () => {
  it('is a no-op when state.entries is empty', () => {
    const s = createTriggerState();
    accumulateCooldown(s, 10);
    expect(s.entries).toEqual({});
  });

  it('does NOT auto-create entries — accumulating before any access leaves state empty', () => {
    const s = createTriggerState();
    accumulateCooldown(s, 50);
    accumulateCooldown(s, 50);
    expect(Object.keys(s.entries).length).toBe(0);
  });

  it('successive accumulations sum on an existing entry (10 + 20 → 30)', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    // Lazy-init via shouldFire so the entry exists prior to accumulating.
    shouldFire(s, key, 'on_cooldown', 100, undefined);
    accumulateCooldown(s, 10);
    accumulateCooldown(s, 20);
    expect(shouldFire(s, key, 'on_cooldown', 30, undefined)).toBe(true);
    expect(shouldFire(s, key, 'on_cooldown', 31, undefined)).toBe(false);
  });

  it('increments every existing entry uniformly', () => {
    const s = createTriggerState();
    shouldFire(s, k('p1', 0), 'on_cooldown', 100, undefined);
    shouldFire(s, k('p2', 1), 'on_cooldown', 100, undefined);
    accumulateCooldown(s, 25);
    expect(shouldFire(s, k('p1', 0), 'on_cooldown', 25, undefined)).toBe(true);
    expect(shouldFire(s, k('p2', 1), 'on_cooldown', 25, undefined)).toBe(true);
    expect(shouldFire(s, k('p1', 0), 'on_cooldown', 26, undefined)).toBe(false);
  });
});

describe('shouldFire — on_cooldown', () => {
  it('returns false when accumulator < cooldownTicks', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    shouldFire(s, key, 'on_cooldown', 50, undefined); // lazy-init at accumulator=0
    expect(shouldFire(s, key, 'on_cooldown', 50, undefined)).toBe(false);
    accumulateCooldown(s, 30);
    expect(shouldFire(s, key, 'on_cooldown', 50, undefined)).toBe(false);
  });

  it('returns true when accumulator >= cooldownTicks', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    shouldFire(s, key, 'on_cooldown', 50, undefined); // lazy-init
    accumulateCooldown(s, 50);
    expect(shouldFire(s, key, 'on_cooldown', 50, undefined)).toBe(true);
    accumulateCooldown(s, 1);
    expect(shouldFire(s, key, 'on_cooldown', 50, undefined)).toBe(true);
  });

  it('returns false when cooldownTicks is undefined (defensive — caller bug)', () => {
    const s = createTriggerState();
    expect(shouldFire(s, k('p1', 0), 'on_cooldown', undefined, undefined)).toBe(false);
  });
});

describe('shouldFire — maxTriggersPerCombat gating', () => {
  it('returns false once firedCount reaches the cap', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    expect(shouldFire(s, key, 'on_round_start', undefined, 1)).toBe(true);
    recordFire(s, key, 'on_round_start');
    expect(shouldFire(s, key, 'on_round_start', undefined, 1)).toBe(false);
  });

  it('uncapped (undefined) gating allows unlimited fires', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    for (let i = 0; i < 100; i++) {
      expect(shouldFire(s, key, 'on_round_start', undefined, undefined)).toBe(true);
      recordFire(s, key, 'on_round_start');
    }
  });
});

describe('shouldFire — on_low_health', () => {
  it('returns true initially, false after recordFire(on_low_health)', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    expect(shouldFire(s, key, 'on_low_health', undefined, undefined)).toBe(true);
    recordFire(s, key, 'on_low_health');
    expect(shouldFire(s, key, 'on_low_health', undefined, undefined)).toBe(false);
  });

  it('lowHealthFired=true blocks regardless of firedCount-vs-cap', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    recordFire(s, key, 'on_low_health'); // sets lowHealthFired and firedCount=1
    // Even with a generous cap, lowHealthFired=true blocks.
    expect(shouldFire(s, key, 'on_low_health', undefined, 100)).toBe(false);
  });
});

describe('recordFire', () => {
  it('on_cooldown resets cooldownAccumulator to 0 and increments firedCount', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    shouldFire(s, key, 'on_cooldown', 50, undefined); // lazy-init
    accumulateCooldown(s, 60);
    expect(shouldFire(s, key, 'on_cooldown', 50, undefined)).toBe(true);
    recordFire(s, key, 'on_cooldown');
    expect(shouldFire(s, key, 'on_cooldown', 50, undefined)).toBe(false); // accumulator reset
    expect(s.entries['p1:0']!.firedCount).toBe(1);
    expect(s.entries['p1:0']!.cooldownAccumulator).toBe(0);
  });

  it('on_low_health sets lowHealthFired=true and increments firedCount', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    recordFire(s, key, 'on_low_health');
    expect(s.entries['p1:0']!.lowHealthFired).toBe(true);
    expect(s.entries['p1:0']!.firedCount).toBe(1);
  });

  it('on_hit / on_taken_damage / on_round_start / on_adjacent_trigger only increment firedCount', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    shouldFire(s, key, 'on_hit', undefined, undefined); // lazy-init
    accumulateCooldown(s, 25);
    expect(s.entries['p1:0']!.cooldownAccumulator).toBe(25);

    recordFire(s, key, 'on_hit');
    recordFire(s, key, 'on_taken_damage');
    recordFire(s, key, 'on_round_start');
    recordFire(s, key, 'on_adjacent_trigger');

    expect(s.entries['p1:0']!.firedCount).toBe(4);
    expect(s.entries['p1:0']!.cooldownAccumulator).toBe(25); // unchanged
    expect(s.entries['p1:0']!.lowHealthFired).toBe(false);
  });
});

describe('isFiringCapped', () => {
  it('returns true when firedCount === maxTriggersPerCombat', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    recordFire(s, key, 'on_round_start');
    expect(isFiringCapped(s, key, 1)).toBe(true);
  });

  it('returns false when firedCount < maxTriggersPerCombat', () => {
    const s = createTriggerState();
    const key = k('p1', 0);
    recordFire(s, key, 'on_round_start');
    expect(isFiringCapped(s, key, 5)).toBe(false);
  });

  it('returns false when maxTriggersPerCombat is undefined (uncapped)', () => {
    const s = createTriggerState();
    expect(isFiringCapped(s, k('p1', 0), undefined)).toBe(false);
  });

  it('lazy-init: capped check on a never-touched key returns false (firedCount=0) and creates the entry', () => {
    const s = createTriggerState();
    expect(isFiringCapped(s, k('p1', 0), 1)).toBe(false);
    expect(s.entries['p1:0']).toBeDefined();
    expect(s.entries['p1:0']!.firedCount).toBe(0);
  });
});

describe('lazy-init defaults', () => {
  it('shouldFire on a never-accumulated on_cooldown key returns false (accumulator=0)', () => {
    const s = createTriggerState();
    expect(shouldFire(s, k('p1', 0), 'on_cooldown', 1, undefined)).toBe(false);
  });

  it('shouldFire on a never-accumulated on_round_start key with no cap returns true', () => {
    const s = createTriggerState();
    expect(shouldFire(s, k('p1', 0), 'on_round_start', undefined, undefined)).toBe(true);
  });

  it('shouldFire creates the entry on first access with documented defaults', () => {
    const s = createTriggerState();
    expect(Object.keys(s.entries)).toHaveLength(0);
    shouldFire(s, k('p1', 0), 'on_round_start', undefined, undefined);
    expect(s.entries['p1:0']).toEqual({
      cooldownAccumulator: 0,
      firedCount: 0,
      lowHealthFired: false,
    });
  });
});

describe('determinism — two states driven through the same sequence produce identical entries', () => {
  it('parallel sequences produce identical state.entries', () => {
    const s1 = createTriggerState();
    const s2 = createTriggerState();

    const sequence: ReadonlyArray<readonly [TriggerKey, string]> = [
      [k('p1', 0), 'init-cooldown'],
      [k('p2', 1), 'init-roundstart'],
      [k('p1', 0), 'fire-cooldown'],
      [k('p2', 1), 'fire-roundstart'],
      [k('p3', 0), 'fire-lowhealth'],
    ];

    for (const [key, op] of sequence) {
      for (const s of [s1, s2]) {
        if (op === 'init-cooldown') shouldFire(s, key, 'on_cooldown', 10, undefined);
        else if (op === 'init-roundstart') shouldFire(s, key, 'on_round_start', undefined, undefined);
        else if (op === 'fire-cooldown') recordFire(s, key, 'on_cooldown');
        else if (op === 'fire-roundstart') recordFire(s, key, 'on_round_start');
        else if (op === 'fire-lowhealth') recordFire(s, key, 'on_low_health');
        accumulateCooldown(s, 5);
      }
    }

    expect(s1.entries).toEqual(s2.entries);
    // Iteration order is canonical regardless of insertion order:
    expect(Object.keys(s1.entries).sort()).toEqual(Object.keys(s2.entries).sort());
  });
});
