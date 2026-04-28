// status.test.ts — burn / poison / stun semantics for the M1.2.2 status engine.
//
// Numbers come from balance-bible.md § 4 + STATUS_STACK_CAPS in content-schemas.ts § 16.
// Tick ordering (status_ticks before cleanup, etc.) lives in iteration.ts TICK_PHASES;
// this file tests the verbs in isolation, the resolver in M1.2.3 will test their
// interaction with the rest of the tick.

import { describe, expect, it } from 'vitest';
import { STATUS_STACK_CAPS } from '@packbreaker/content';
import {
  applyStatus,
  cleanupStatus,
  consumeStunIfPending,
  createStatusState,
  tickStatusDamage,
} from '../src/status';

describe('createStatusState', () => {
  it('starts with all flags clear', () => {
    const s = createStatusState();
    expect(s.burn).toBe(0);
    expect(s.poison).toBe(0);
    expect(s.pendingStun).toBe(false);
    expect(s.burnRemainingTicks).toBe(20);
  });
});

describe('applyStatus — burn', () => {
  it('applying 3 burn to a clean state sets burn=3', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 3);
    expect(s.burn).toBe(3);
  });

  it('stacks add: burn=5 + applyStatus(burn, 3) → burn=8', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 5);
    applyStatus(s, 'burn', 3);
    expect(s.burn).toBe(8);
  });

  it('caps silently at STATUS_STACK_CAPS.burn (= 10)', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 5);
    applyStatus(s, 'burn', 8);
    expect(s.burn).toBe(STATUS_STACK_CAPS.burn);
    expect(s.burn).toBe(10);
  });

  it('rejects non-integer stacks (no mutation)', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 2.5);
    expect(s.burn).toBe(0);
  });

  it('rejects negative stacks (no mutation)', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', -3);
    expect(s.burn).toBe(0);
  });
});

describe('applyStatus — poison', () => {
  it('applying 3 poison to a clean state sets poison=3', () => {
    const s = createStatusState();
    applyStatus(s, 'poison', 3);
    expect(s.poison).toBe(3);
  });

  it('stacks add and cap at STATUS_STACK_CAPS.poison (= 10)', () => {
    const s = createStatusState();
    applyStatus(s, 'poison', 7);
    applyStatus(s, 'poison', 5);
    expect(s.poison).toBe(STATUS_STACK_CAPS.poison);
    expect(s.poison).toBe(10);
  });

  it('does not affect burn or stun', () => {
    const s = createStatusState();
    applyStatus(s, 'poison', 4);
    expect(s.burn).toBe(0);
    expect(s.pendingStun).toBe(false);
  });
});

describe('applyStatus — stun', () => {
  it('apply with stacks=1 sets pendingStun=true', () => {
    const s = createStatusState();
    applyStatus(s, 'stun', 1);
    expect(s.pendingStun).toBe(true);
  });

  it('stacks parameter is ignored — apply with stacks=5 is still boolean true', () => {
    const s = createStatusState();
    applyStatus(s, 'stun', 5);
    expect(s.pendingStun).toBe(true);
  });

  it('re-applying while pendingStun is already true is a no-op (no benefit)', () => {
    const s = createStatusState();
    applyStatus(s, 'stun', 1);
    applyStatus(s, 'stun', 1);
    expect(s.pendingStun).toBe(true);
  });
});

describe('tickStatusDamage — burn', () => {
  it('returns burnDamage = burn count every 10 ticks (1 sec)', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 5);
    expect(tickStatusDamage(s, 10).burnDamage).toBe(5);
    expect(tickStatusDamage(s, 20).burnDamage).toBe(5);
    expect(tickStatusDamage(s, 30).burnDamage).toBe(5);
  });

  it('returns 0 between integer-second boundaries', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 5);
    expect(tickStatusDamage(s, 1).burnDamage).toBe(0);
    expect(tickStatusDamage(s, 7).burnDamage).toBe(0);
    expect(tickStatusDamage(s, 15).burnDamage).toBe(0);
    expect(tickStatusDamage(s, 99).burnDamage).toBe(0);
  });

  it('returns 0 at tick 0 (no damage on the very first tick of combat)', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 5);
    expect(tickStatusDamage(s, 0).burnDamage).toBe(0);
  });
});

describe('tickStatusDamage — poison', () => {
  it('returns poisonDamage = poison count every 10 ticks', () => {
    const s = createStatusState();
    applyStatus(s, 'poison', 4);
    expect(tickStatusDamage(s, 10).poisonDamage).toBe(4);
    expect(tickStatusDamage(s, 100).poisonDamage).toBe(4);
  });

  it('returns burn AND poison together when both are present', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 3);
    applyStatus(s, 'poison', 2);
    const r = tickStatusDamage(s, 50);
    expect(r.burnDamage).toBe(3);
    expect(r.poisonDamage).toBe(2);
  });
});

describe('cleanupStatus — burn decay', () => {
  it('decrements burn by 1 every 20 ticks of cleanup', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 5);
    for (let t = 0; t < 19; t++) cleanupStatus(s, t);
    expect(s.burn).toBe(5);            // not yet decayed
    cleanupStatus(s, 19);
    expect(s.burn).toBe(4);            // first decay at the 20th cleanup
    for (let t = 20; t < 39; t++) cleanupStatus(s, t);
    expect(s.burn).toBe(4);
    cleanupStatus(s, 39);
    expect(s.burn).toBe(3);            // second decay
  });

  it('after 200 ticks of burn=5 with no re-application, burn reaches 0', () => {
    const s = createStatusState();
    applyStatus(s, 'burn', 5);
    for (let t = 0; t < 200; t++) cleanupStatus(s, t);
    expect(s.burn).toBe(0);
  });

  it('does not decay when burn is already 0', () => {
    const s = createStatusState();
    for (let t = 0; t < 100; t++) cleanupStatus(s, t);
    expect(s.burn).toBe(0);
    expect(s.burnRemainingTicks).toBe(20);
  });
});

describe('cleanupStatus — poison persists', () => {
  it('does NOT decay poison (persists full combat)', () => {
    const s = createStatusState();
    applyStatus(s, 'poison', 5);
    for (let t = 0; t < 600; t++) cleanupStatus(s, t);
    expect(s.poison).toBe(5);
  });
});

describe('consumeStunIfPending', () => {
  it('returns true and clears the flag when stun is pending', () => {
    const s = createStatusState();
    applyStatus(s, 'stun', 1);
    expect(consumeStunIfPending(s)).toBe(true);
    expect(s.pendingStun).toBe(false);
  });

  it('returns false on a clean state', () => {
    const s = createStatusState();
    expect(consumeStunIfPending(s)).toBe(false);
    expect(s.pendingStun).toBe(false);
  });

  it('subsequent calls after consuming return false until re-applied', () => {
    const s = createStatusState();
    applyStatus(s, 'stun', 1);
    consumeStunIfPending(s);
    expect(consumeStunIfPending(s)).toBe(false);
    expect(consumeStunIfPending(s)).toBe(false);
  });

  it('after consume, applying stun again allows another consume', () => {
    const s = createStatusState();
    applyStatus(s, 'stun', 1);
    expect(consumeStunIfPending(s)).toBe(true);
    applyStatus(s, 'stun', 1);
    expect(consumeStunIfPending(s)).toBe(true);
  });
});
