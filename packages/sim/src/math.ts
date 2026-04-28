// Integer-math utilities. tech-architecture.md § 4.1 rule 4: "No floating-point
// math in core resolution. HP, damage, gold, cooldowns are integers. Effect
// modifiers like +10% resolve via Math.floor((base * 110) / 100) patterns."
//
// All utilities reject float input by returning NaN (rather than silently
// rounding). The only float in the entire sim package is the [0,1) return
// from Rng.next(); it gets immediately consumed into integer math via
// Math.floor in nextInt().

/** Apply a percentage modifier to a base integer. Floored to integer.
 *
 *  applyPct(100,  10) === 110
 *  applyPct(100, -25) === 75
 *  applyPct(7,    25) === 8   (floor of 8.75)
 *  applyPct(0,   100) === 0
 *
 *  Float input → NaN. */
export function applyPct(base: number, pct: number): number {
  if (!Number.isInteger(base) || !Number.isInteger(pct)) return NaN;
  return Math.floor((base * (100 + pct)) / 100);
}

/** Apply a basis-point modifier. 10000 bp = 100%, 5000 bp = 50%.
 *  Used by sellRecoveryBp, itemCostMultiplierBp.
 *
 *  applyBp(100, 10000) === 100   (×1.0)
 *  applyBp(100,  5000) === 50    (×0.5)
 *  applyBp(7,    5000) === 3     (floor of 3.5)
 *
 *  Float input → NaN. */
export function applyBp(base: number, bp: number): number {
  if (!Number.isInteger(base) || !Number.isInteger(bp)) return NaN;
  return Math.floor((base * bp) / 10000);
}

/** Clamp an integer to [min, max] inclusive.
 *
 *  clamp( 5,  1, 10) ===  5
 *  clamp(-5,  1, 10) ===  1
 *  clamp(15,  1, 10) === 10
 *
 *  Float input on any arg → NaN. */
export function clamp(n: number, min: number, max: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(min) || !Number.isInteger(max)) return NaN;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** Sum a list of integers. Returns NaN if any element fails Number.isInteger,
 *  preventing accidental float accumulation in run-state aggregations. */
export function sumInts(values: ReadonlyArray<number>): number {
  let sum = 0;
  for (const v of values) {
    if (!Number.isInteger(v)) return NaN;
    sum += v;
  }
  return sum;
}
