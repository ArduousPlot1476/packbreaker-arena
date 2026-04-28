// Canonical mulberry32 PRNG. tech-architecture.md § 4.1 locks this algorithm —
// any variation breaks the determinism / replay invariant. Single 32-bit state,
// uses Math.imul + the >>> 0 normalizer + the standard chain, divides by 2^32.
//
// Consumers create one Rng per simulation and never share across sims. There is
// no top-level random() export — all randomness flows through an Rng instance.

import type { SimSeed } from '@packbreaker/content';

export interface Rng {
  /** Returns a uniform [0, 1) float. Advances internal state. */
  next(): number;

  /** Returns an integer in [min, max] inclusive. Floors `next() * range`. */
  nextInt(min: number, max: number): number;

  /** Returns a fresh Rng with the same internal state.
   *  Used for branching: "what would the next 10 rolls look like" without consuming them. */
  clone(): Rng;

  /** Read-only snapshot of internal state. Used for replay fixture authoring. */
  readonly state: number;
}

class Mulberry32Rng implements Rng {
  #state: number;

  constructor(seed: number) {
    // Coerce to 32-bit signed integer; mulberry32's state is interpreted as uint32
    // at the >>> 0 step in next(), so the storage representation is irrelevant.
    this.#state = seed | 0;
  }

  get state(): number {
    return this.#state;
  }

  next(): number {
    let t = (this.#state = (this.#state + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  clone(): Rng {
    return new Mulberry32Rng(this.#state);
  }
}

/** Constructs an Rng from a SimSeed. Identical seeds produce identical sequences
 *  on every platform — Node ≥ 20, modern browsers, anywhere Math.imul exists. */
export function createRng(seed: SimSeed): Rng {
  return new Mulberry32Rng(seed as number);
}
