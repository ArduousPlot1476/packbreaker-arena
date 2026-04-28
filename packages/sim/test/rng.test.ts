// rng.test.ts — determinism, distribution, and cross-platform fixture tests for
// the canonical mulberry32 PRNG. The fixture comparison is the line in the sand:
// if a future Node release / browser port diverges from rng-sequences.json,
// THE BUILD IS BROKEN — do not regenerate the fixture, fix the divergence.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SimSeed } from '@packbreaker/content';
import { createRng } from '../src/rng';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('mulberry32 — determinism', () => {
  it('identical seeds produce identical first 100 values', () => {
    const a = createRng(SimSeed(42));
    const b = createRng(SimSeed(42));
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('two instances from same seed advance identically through 1000 calls', () => {
    const a = createRng(SimSeed(0xc0ffee));
    const b = createRng(SimSeed(0xc0ffee));
    for (let i = 0; i < 1000; i++) {
      const va = a.next();
      const vb = b.next();
      expect(va).toBe(vb);
    }
    expect(a.state).toBe(b.state);
  });

  it('clone() preserves state and produces the same sequence from that point', () => {
    const a = createRng(SimSeed(7));
    a.next(); // burn one to land on a non-seed state
    const b = a.clone();
    expect(b.state).toBe(a.state);
    // From the cloned point, a and b emit identical sequences when advanced in parallel.
    for (let i = 0; i < 20; i++) {
      expect(b.next()).toBe(a.next());
    }
  });

  it('clone is independent — advancing the original does not affect the clone', () => {
    const a = createRng(SimSeed(7));
    a.next(); // burn one
    const b = a.clone();
    const stateAtClone = b.state;
    // Burn 10 calls on a; b should be untouched.
    for (let i = 0; i < 10; i++) a.next();
    expect(b.state).toBe(stateAtClone);
    // b's first next() should equal what a fresh rng cloned at the same point would produce.
    const reference = createRng(SimSeed(7));
    reference.next(); // mirror the burn
    expect(b.next()).toBe(reference.next());
  });

  it('state after N calls equals state of fresh Rng after the same N calls', () => {
    const seed = SimSeed(123);
    const a = createRng(seed);
    const b = createRng(seed);
    for (let i = 0; i < 50; i++) a.next();
    for (let i = 0; i < 50; i++) b.next();
    expect(a.state).toBe(b.state);
  });

  it('different seeds produce different sequences', () => {
    const a = createRng(SimSeed(1));
    const b = createRng(SimSeed(2));
    let differences = 0;
    for (let i = 0; i < 100; i++) {
      if (a.next() !== b.next()) differences++;
    }
    expect(differences).toBeGreaterThan(95);
  });
});

describe('mulberry32 — distribution', () => {
  it('100k next() calls have mean within 0.005 of 0.5 and stddev within 0.005 of 1/sqrt(12)', () => {
    const rng = createRng(SimSeed(0xdeadbeef));
    const N = 100_000;
    let sum = 0;
    const values: number[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const v = rng.next();
      values[i] = v;
      sum += v;
    }
    const mean = sum / N;
    let varSum = 0;
    for (let i = 0; i < N; i++) {
      const d = values[i]! - mean;
      varSum += d * d;
    }
    const stddev = Math.sqrt(varSum / N);
    const expectedStddev = 1 / Math.sqrt(12);
    expect(Math.abs(mean - 0.5)).toBeLessThan(0.005);
    expect(Math.abs(stddev - expectedStddev)).toBeLessThan(0.005);
  });

  it('100k nextInt(1, 6) calls land in roughly uniform buckets (each within 2% of expected)', () => {
    const rng = createRng(SimSeed(987654321));
    const N = 100_000;
    const expected = N / 6;
    const tolerance = expected * 0.02; // 2% of 16667 ≈ 333
    const buckets = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < N; i++) {
      const v = rng.nextInt(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      buckets[v - 1]!++;
    }
    for (let b = 0; b < 6; b++) {
      expect(Math.abs(buckets[b]! - expected)).toBeLessThan(tolerance);
    }
  });

  it('next() always returns a value in [0, 1)', () => {
    const rng = createRng(SimSeed(99));
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('nextInt(min, max) is inclusive on both ends', () => {
    const rng = createRng(SimSeed(2024));
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.nextInt(0, 3));
    expect(seen.has(0)).toBe(true);
    expect(seen.has(3)).toBe(true);
    expect([...seen].every((n) => n >= 0 && n <= 3)).toBe(true);
  });
});

describe('mulberry32 — cross-platform fixture', () => {
  type Fixture = {
    algorithm: string;
    entries: ReadonlyArray<{ seed: number; values: ReadonlyArray<number> }>;
  };

  const fixturePath = join(__dirname, 'fixtures', 'rng-sequences.json');
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture;

  it('fixture exists and uses mulberry32', () => {
    expect(fixture.algorithm).toBe('mulberry32');
    expect(fixture.entries.length).toBeGreaterThanOrEqual(5);
  });

  for (const entry of fixture.entries) {
    it(`seed ${entry.seed}: live RNG matches fixture byte-for-byte`, () => {
      const rng = createRng(SimSeed(entry.seed));
      const live: number[] = [];
      for (let i = 0; i < entry.values.length; i++) live.push(rng.next());
      expect(live).toEqual(entry.values);
    });
  }
});
