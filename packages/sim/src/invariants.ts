// Runtime invariants. M1.2.1 placeholder — combat / status / effect modules
// (M1.2.2+) will add internal assertions here as they land. Keeping a stable
// import target so call sites don't shift when the module gets populated.
//
// Convention: invariants throw with descriptive messages. They run in dev AND
// prod (sim correctness > bundle bytes). If profile data ever shows them as a
// hot path, we revisit per-invariant.

/** Throw if condition is falsy. Used at sim-internal boundaries where a
 *  schema-shape contract can't be expressed at the type level. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`sim invariant: ${message}`);
  }
}
