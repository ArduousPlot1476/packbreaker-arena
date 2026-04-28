// Barrel smoke test — confirms the public API surface exposed via @packbreaker/sim
// is what M1.2.2+ consumers will import.

import { describe, expect, it } from 'vitest';
import * as sim from '../src/index';

describe('@packbreaker/sim barrel', () => {
  it('exports the M1.2.1 public API', () => {
    // RNG
    expect(typeof sim.createRng).toBe('function');
    // Iteration
    expect(typeof sim.canonicalPlacements).toBe('function');
    expect(typeof sim.canonicalCells).toBe('function');
    expect(typeof sim.stableSort).toBe('function');
    // Math
    expect(typeof sim.applyPct).toBe('function');
    expect(typeof sim.applyBp).toBe('function');
    expect(typeof sim.clamp).toBe('function');
    expect(typeof sim.sumInts).toBe('function');
    // Invariants
    expect(typeof sim.invariant).toBe('function');
  });
});
