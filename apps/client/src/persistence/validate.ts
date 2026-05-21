// Load-boundary shape validator for LocalSaveV1 + nested SerializedRunState.
//
// M1.5b PR 3 / 5b.3a Phase 2.5h (meta-audit remediation; Catch 22 / Class A).
//
// Pre-remediation, migrate() routed by schemaVersion alone and cast the
// payload to LocalSaveV1 with zero structural validation. Any malformed
// payload that happened to carry schemaVersion===1 then threw downstream:
//   - restoreRun's `serialized.relics.starter` deref (A3),
//   - constructor's `{ ...restoreFrom.relics }` spread (A6),
//   - constructor's `restoreFrom.history.slice()` (A7),
//   - reducer arm's `s.bag.placements.map(...)` / `s.shop.slots.map(...)` (A8).
// The unhandled throw lived inside a Promise callback (useRun's dynamic
// import .then), so it surfaced as a console rejection rather than a React
// crash — simRun stayed null and the fresh-run UI mounted, but with a
// dirtied console.
//
// This validator validates LocalSaveV1 + SerializedRunState to the depth
// that guarantees the load + restore path cannot throw. Any structural
// mismatch returns null; callers treat null as "no save / corrupt save"
// and proceed with a fresh-run path.
//
// Hand-rolled (no Zod — not a workspace dep, and adding one is out of
// scope for 5b.3a; tech-architecture.md § 6.3 plans Zod as a server-side
// dep but it is not installed). Forward-compat: when LocalSaveV2 lands,
// add validateLocalSaveV2 here and route via the migration dispatcher.

import type { LocalSaveV1 } from '@packbreaker/shared';

const RUN_OUTCOMES = new Set([
  'in_progress',
  'won',
  'eliminated',
  'abandoned',
]);

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function isStr(x: unknown): x is string {
  return typeof x === 'string';
}

function isArr(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

function isValidPlacement(x: unknown): boolean {
  if (!isObj(x)) return false;
  if (!isStr(x.placementId)) return false;
  if (!isStr(x.itemId)) return false;
  if (!isNum(x.rotation)) return false;
  const anchor = x.anchor;
  if (!isObj(anchor)) return false;
  if (!isNum(anchor.col)) return false;
  if (!isNum(anchor.row)) return false;
  return true;
}

function isValidSerializedRunState(x: unknown): boolean {
  if (!isObj(x)) return false;

  // Outcome (constrained string).
  if (!isStr(x.outcome) || !RUN_OUTCOMES.has(x.outcome)) return false;

  // Numerics (must be finite — NaN/Infinity rejected).
  if (!isNum(x.hearts)) return false;
  if (!isNum(x.gold)) return false;
  if (!isNum(x.currentRound)) return false;
  if (!isNum(x.rngState)) return false;
  if (!isNum(x.rerollCount)) return false;
  if (!isNum(x.trophy)) return false;
  if (!isNum(x.seed)) return false;

  // Branded identifiers (runtime: string).
  if (!isStr(x.classId)) return false;
  if (!isStr(x.contractId)) return false;
  if (!isStr(x.startedAt)) return false;

  // Relics: starter must be non-null (restoreRun's contract); mid/boss
  // may be null but, if present, must be string.
  const relics = x.relics;
  if (!isObj(relics)) return false;
  if (!isStr(relics.starter)) return false;
  if (relics.mid !== null && !isStr(relics.mid)) return false;
  if (relics.boss !== null && !isStr(relics.boss)) return false;

  // History: array. Element shape is not load-bearing for restore (sim's
  // history.slice() is array-safe; downstream consumers optional-chain).
  if (!isArr(x.history)) return false;

  // Bag: dimensions are recomposed from effective ruleset, so not
  // validated; placements must be array AND each element must have a
  // valid shape because the restore_from_save reducer arm dereferences
  // p.anchor.col / p.anchor.row inside .map (A8).
  const bag = x.bag;
  if (!isObj(bag)) return false;
  if (!isArr(bag.placements)) return false;
  for (const p of bag.placements) {
    if (!isValidPlacement(p)) return false;
  }

  // Shop: slots must be array of strings (ItemId at runtime); purchased
  // array of numbers; rerollsThisRound numeric.
  const shop = x.shop;
  if (!isObj(shop)) return false;
  if (!isArr(shop.slots)) return false;
  for (const slot of shop.slots) {
    if (!isStr(slot)) return false;
  }
  if (!isArr(shop.purchased)) return false;
  for (const idx of shop.purchased) {
    if (!isNum(idx)) return false;
  }
  if (!isNum(shop.rerollsThisRound)) return false;

  return true;
}

/** Type predicate: narrows `parsed: unknown` to `LocalSaveV1` iff the
 *  payload is structurally valid. Validation depth: enough to guarantee
 *  the load + restore path (loadLocal → migrate → useRun load effect →
 *  restoreRun → reducer restore_from_save arm) cannot throw.
 *
 *  Envelope fields not consumed by the restore path (trophies,
 *  dailyStreak, lastDailyAttempted, tutorialCompleted, telemetryAnonId)
 *  are not validated — they pass through and surface in client state
 *  as-is. M2 will tighten when those fields gain consumers.
 *
 *  Returning a `parsed is LocalSaveV1` predicate (vs `LocalSaveV1 | null`)
 *  lets callers narrow `parsed` in-place without a structural cast,
 *  dropping the `as unknown as LocalSaveV1` smell that the value-form
 *  needed because `Record<string, unknown>` doesn't structurally overlap
 *  with LocalSaveV1 to TypeScript's eye. */
export function validateLocalSaveV1(parsed: unknown): parsed is LocalSaveV1 {
  if (!isObj(parsed)) return false;
  if (parsed.schemaVersion !== 1) return false;

  // inProgressRun: null OR a fully-validated SerializedRunState.
  const ip = parsed.inProgressRun;
  if (ip !== null && !isValidSerializedRunState(ip)) return false;

  return true;
}
