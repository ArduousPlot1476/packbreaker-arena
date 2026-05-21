// Load-boundary shape validator for LocalSaveV1 + nested SerializedRunState.
//
// M1.5b PR 3 / 5b.3a Phase 2.5h (Catch 22 / Class A; load-boundary
// shape validator + restore try/catch). Phase 2.5i (Catch 24 — same
// class, completes the contract per the new Rule 11): validator now
// validates the COMPLETE persisted contract — every field present
// with the correct primitive type, full structural validation of
// nested objects (Ruleset, DerivedModifiers, BagState, ShopState,
// RelicSlots), AND registry membership for id-typed fields
// (classId ∈ CLASSES, contractId ∈ CONTRACTS, relics.* ∈ RELICS
// where non-null).
//
// Rule 11 (codified at 5b.3a Phase 2.5i): a load/deserialization
// boundary validator must validate the COMPLETE persisted contract
// — every field's presence + type, full structural validity of
// nested objects, and registry membership for id-typed fields.
// Deref-safety must be STRUCTURAL (any consumer is safe on a
// validated payload), never dependent on enumerating known
// consumers. The Phase 2.5h validator validated a field-subset
// (the surfaces the Phase 2.5g meta-audit enumerated); Codex
// finding #5 caught the gap (applySimSnapshot derefs
// snapshot.ruleset.startingHearts + CLASSES[snapshot.classId] —
// neither was structurally validated). Catch 24 closes the class
// by validating the full contract regardless of which consumer
// might deref it.
//
// Hand-rolled (no Zod — not a workspace dep, and adding one is out
// of scope for 5b.3a; tech-architecture.md § 6.3 plans Zod as a
// server-side dep but it is not installed). Forward-compat: when
// LocalSaveV2 lands, add validateLocalSaveV2 here and route via the
// migration dispatcher.

import type { LocalSaveV1 } from '@packbreaker/shared';
import { CLASSES, CONTRACTS, RELICS } from '@packbreaker/content';

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

// Known ContractMutator variants (content-schemas.ts § 8). Validator
// requires .type ∈ this set so future client-side mutator iteration
// can safely switch on type without runtime surprise. Nested optional
// fields of 'boss_only' are not validated — they're consumed only by
// sim's combat path (sim-side, behind useRun's restoreRun try/catch).
const KNOWN_MUTATOR_TYPES = new Set([
  'adjacent_double',
  'recipe_discount',
  'no_rerolls',
  'boss_only',
]);

function isValidMutator(x: unknown): boolean {
  if (!isObj(x)) return false;
  if (!isStr(x.type)) return false;
  if (!KNOWN_MUTATOR_TYPES.has(x.type)) return false;
  return true;
}

function isValidRuleset(x: unknown): boolean {
  if (!isObj(x)) return false;
  // bagDimensions: {width, height} numeric.
  const dims = x.bagDimensions;
  if (!isObj(dims)) return false;
  if (!isNum(dims.width)) return false;
  if (!isNum(dims.height)) return false;
  // 12 scalar numeric levers (content-schemas.ts § Ruleset).
  if (!isNum(x.maxRounds)) return false;
  if (!isNum(x.bossRound)) return false;
  if (!isNum(x.startingHearts)) return false;
  if (!isNum(x.shopSize)) return false;
  if (!isNum(x.baseGoldPerRound)) return false;
  if (!isNum(x.goldStepRounds)) return false;
  if (!isNum(x.goldStepAmount)) return false;
  if (!isNum(x.rerollCostStart)) return false;
  if (!isNum(x.rerollCostIncrement)) return false;
  if (!isNum(x.itemCostMultiplierBp)) return false;
  if (!isNum(x.winBonusGold)) return false;
  if (!isNum(x.sellRecoveryBp)) return false;
  // mutators: array of valid ContractMutator entries.
  if (!isArr(x.mutators)) return false;
  for (const m of x.mutators) {
    if (!isValidMutator(m)) return false;
  }
  return true;
}

function isValidDerived(x: unknown): boolean {
  if (!isObj(x)) return false;
  if (!isNum(x.extraRerollsPerRound)) return false;
  if (!isNum(x.itemCostDelta)) return false;
  if (!isNum(x.bonusGoldOnWin)) return false;
  return true;
}

function isKnownClassId(x: unknown): boolean {
  return isStr(x) && Object.prototype.hasOwnProperty.call(CLASSES, x);
}

function isKnownContractId(x: unknown): boolean {
  return isStr(x) && Object.prototype.hasOwnProperty.call(CONTRACTS, x);
}

function isKnownRelicId(x: unknown): boolean {
  return isStr(x) && Object.prototype.hasOwnProperty.call(RELICS, x);
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

  // Branded id-typed fields: registry-membership-checked. Phase 2.5i
  // / Catch 24: previously only string-typed; Codex finding #5
  // caught that `CLASSES[snapshot.classId]!.displayName` at
  // RunController.ts:193 throws on unknown classId. Validate against
  // the registries so downstream `REGISTRY[id]!` lookups (LeftRail /
  // RelicsTab / RunEndScreen) cannot throw on a passing payload.
  // contractId currently has no client-side REGISTRY[id] consumer
  // (sim-side CONTRACTS lookup is behind useRun's restoreRun
  // try/catch) — validated structurally per Rule 11 (deref-safety
  // is structural, not enumeration-dependent; future client
  // consumers stay safe by construction).
  if (!isKnownClassId(x.classId)) return false;
  if (!isKnownContractId(x.contractId)) return false;
  if (!isStr(x.startedAt)) return false;

  // Relics: starter must be a known non-null RelicId (restoreRun's
  // contract). mid/boss may be null but if present must also be
  // known. Downstream consumers (LeftRail.tsx:104-108,
  // RelicsTab.tsx:82-85) eagerly do `RELICS[id]!` lookups.
  const relics = x.relics;
  if (!isObj(relics)) return false;
  if (!isKnownRelicId(relics.starter)) return false;
  if (relics.mid !== null && !isKnownRelicId(relics.mid)) return false;
  if (relics.boss !== null && !isKnownRelicId(relics.boss)) return false;

  // Ruleset (Phase 2.5i / Catch 24): full structural validation.
  // applySimSnapshot at RunController.ts:192 derefs
  // `snapshot.ruleset.startingHearts`; ShopPanel / ShopTab /
  // CombatOverlay / useRun all deref further fields
  // (`bagDimensions.width/height`, `rerollCostStart`,
  // `rerollCostIncrement`, etc.). Full Ruleset validation per
  // Rule 11.
  if (!isValidRuleset(x.ruleset)) return false;

  // DerivedModifiers (Phase 2.5i / Catch 24): full shape validation.
  // ShopPanel / ShopTab / RunController reducer / useRun all deref
  // `derived.extraRerollsPerRound`; sim consumers (combat path)
  // read itemCostDelta + bonusGoldOnWin.
  if (!isValidDerived(x.derived)) return false;

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
