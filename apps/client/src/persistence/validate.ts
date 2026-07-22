// Load-boundary shape validator for LocalSaveV1 + nested SerializedRunState.
//
// M1.5b PR 3 / 5b.3a Phase 2.5j (Catch 25 — Class A batch, structural close).
//
// Replaces the hand-rolled per-field validator from Phase 2.5h/2.5i with
// a Zod schema-derived validator. The hand-rolled approach is structurally
// enumeration-fragile by construction — each iteration trades one set of
// forgotten surfaces for another (Phase 2.5h missed registry membership,
// Phase 2.5i closed CLASSES/CONTRACTS/RELICS but missed ITEMS + history
// element shape, etc.). Pattern 7 recurred three times within this PR
// despite mid-PR Rule 11 codification — the discipline alone was not
// sufficient, the fix had to be structural.
//
// Rule 11 (amended at 5b.3a Phase 2.5j): "Large persisted contracts MUST
// use a schema-derived validator (Zod or equivalent). Completeness must
// be type-enforced via dual-satisfies on the schema's z.infer vs the
// canonical type — not enumeration-dependent." See decision-log entry
// for Phase 2.5j.
//
// Three layers of safety:
//   1. The Zod schema below validates the FULL contract (shape +
//      primitive types + registry membership for the 5 id-field
//      surfaces: classId / contractId / relics.starter|mid|boss /
//      bag.placements[].itemId / shop.slots[].itemId).
//   2. The dual-satisfies type assertions below prove the schema's
//      inferred type is bidirectionally structurally equivalent to
//      the canonical SerializedRunState + LocalSaveV1 — a compile-
//      time guarantee that a passing payload is structurally complete.
//   3. useRun's load-on-mount restoreRun call remains wrapped in
//      try/catch (decision-log Catch 22 surface A4/A5: defense-in-
//      depth for restoreRun's own contract throws on unknown
//      registry ids if the registries ever diverge between client
//      and sim, or for any future deref the validator doesn't
//      structurally express).

import { z } from 'zod';
import {
  CLASSES,
  CONTRACTS,
  ITEMS,
  RELICS,
  type ClassId,
  type ContractId,
  type GhostId,
  type IsoDate,
  type IsoTimestamp,
  type ItemId,
  type PlacementId,
  type RelicId,
  type RoundNumber,
  type RunId,
  type SimSeed,
} from '@packbreaker/content';
import type { LocalSaveV1, SerializedRunState } from '@packbreaker/shared';

// ─── Branded-ID validators ──────────────────────────────────────────
// z.custom<BrandedType>(predicate) preserves the brand on the inferred
// type while running the predicate at parse time. Registry-checked ids
// land their `.refine` (effectively) inline via the predicate.

const ClassIdSchema = z.custom<ClassId>(
  (v): v is ClassId =>
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(CLASSES, v),
  { message: 'classId must be a known CLASSES key' },
);
const ContractIdSchema = z.custom<ContractId>(
  (v): v is ContractId =>
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(CONTRACTS, v),
  { message: 'contractId must be a known CONTRACTS key' },
);
const RelicIdSchema = z.custom<RelicId>(
  (v): v is RelicId =>
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(RELICS, v),
  { message: 'relicId must be a known RELICS key' },
);
const ItemIdSchema = z.custom<ItemId>(
  (v): v is ItemId =>
    typeof v === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, v),
  { message: 'itemId must be a known ITEMS key' },
);

// Pass-through branded ids (no registry — type-only brands).
const RunIdSchema = z.custom<RunId>((v): v is RunId => typeof v === 'string');
const SimSeedSchema = z.custom<SimSeed>(
  (v): v is SimSeed => typeof v === 'number' && Number.isFinite(v),
);
const PlacementIdSchema = z.custom<PlacementId>(
  (v): v is PlacementId => typeof v === 'string',
);
const IsoTimestampSchema = z.custom<IsoTimestamp>(
  (v): v is IsoTimestamp => typeof v === 'string',
);
const IsoDateSchema = z.custom<IsoDate>((v): v is IsoDate => typeof v === 'string');
const GhostIdSchema = z.custom<GhostId>((v): v is GhostId => typeof v === 'string');
const RoundNumberSchema = z.custom<RoundNumber>(
  (v): v is RoundNumber => typeof v === 'number' && Number.isFinite(v),
);

// ─── Constrained literals ───────────────────────────────────────────

const RotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

const RunOutcomeSchema = z.union([
  z.literal('in_progress'),
  z.literal('won'),
  z.literal('eliminated'),
  z.literal('abandoned'),
]);

const RoundOutcomeSchema = z.union([z.literal('win'), z.literal('loss')]);

// ─── Leaf object schemas ────────────────────────────────────────────

const CellCoordSchema = z
  .object({
    col: z.number(),
    row: z.number(),
  })
  .readonly();

const BagDimensionsSchema = z
  .object({
    width: z.number(),
    height: z.number(),
  })
  .readonly();

const BagPlacementSchema = z
  .object({
    placementId: PlacementIdSchema,
    itemId: ItemIdSchema,
    anchor: CellCoordSchema,
    rotation: RotationSchema,
  })
  .readonly();

const BagStateSchema = z
  .object({
    dimensions: BagDimensionsSchema,
    placements: z.array(BagPlacementSchema).readonly(),
  })
  .readonly();

// RelicSlots: canonical type allows starter null but restoreRun's
// contract requires it non-null. Schema rejects null starter (refine).
const RelicSlotsSchema = z
  .object({
    starter: RelicIdSchema.nullable(),
    mid: RelicIdSchema.nullable(),
    boss: RelicIdSchema.nullable(),
  })
  .readonly()
  .refine((r) => r.starter !== null, {
    message: 'relics.starter must be non-null',
    path: ['starter'],
  })
  // Phase 2.5j-fix (Codex finding B, P2): registry membership alone
  // is insufficient — the relic's RELICS[id].slot must match the
  // field's expected slot. Pre-fix, a structurally valid save with
  // a boss-tier relic in the starter field would pass; composeRuleset
  // would happily fold the boss modifiers in, granting a progression
  // bypass. This refine rejects mis-slotted relics so safeParse fails
  // and useRun's load-on-mount falls back to a fresh run.
  .refine(
    (r) =>
      r.starter === null ||
      (RELICS[r.starter] !== undefined && RELICS[r.starter]!.slot === 'starter'),
    { message: "relics.starter must reference a relic with slot 'starter'", path: ['starter'] },
  )
  .refine(
    (r) =>
      r.mid === null ||
      (RELICS[r.mid] !== undefined && RELICS[r.mid]!.slot === 'mid'),
    { message: "relics.mid must reference a relic with slot 'mid'", path: ['mid'] },
  )
  .refine(
    (r) =>
      r.boss === null ||
      (RELICS[r.boss] !== undefined && RELICS[r.boss]!.slot === 'boss'),
    { message: "relics.boss must reference a relic with slot 'boss'", path: ['boss'] },
  );

const ShopStateSchema = z
  .object({
    slots: z.array(ItemIdSchema).readonly(),
    purchased: z.array(z.number()).readonly(),
    rerollsThisRound: z.number(),
  })
  .readonly();

// ContractMutator — discriminated union on .type. Optional nested
// fields of 'boss_only' are validated when present.
const ContractMutatorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('adjacent_double') }).readonly(),
  z.object({ type: z.literal('recipe_discount'), amount: z.number() }).readonly(),
  z.object({ type: z.literal('no_rerolls') }).readonly(),
  z
    .object({
      type: z.literal('boss_only'),
      hpOverride: z.number().optional(),
      damageBonus: z.number().optional(),
      lifestealPctBonus: z.number().optional(),
    })
    .readonly(),
]);

const RulesetSchema = z
  .object({
    bagDimensions: BagDimensionsSchema,
    maxRounds: z.number(),
    bossRound: z.number(),
    startingHearts: z.number(),
    shopSize: z.number(),
    baseGoldPerRound: z.number(),
    goldStepRounds: z.number(),
    goldStepAmount: z.number(),
    rerollCostStart: z.number(),
    rerollCostIncrement: z.number(),
    itemCostMultiplierBp: z.number(),
    winBonusGold: z.number(),
    sellRecoveryBp: z.number(),
    mutators: z.array(ContractMutatorSchema).readonly(),
  })
  .readonly();

const DerivedModifiersSchema = z
  .object({
    extraRerollsPerRound: z.number(),
    itemCostDelta: z.number(),
    bonusGoldOnWin: z.number(),
  })
  .readonly();

const RunHistoryEntrySchema = z
  .object({
    round: RoundNumberSchema,
    outcome: RoundOutcomeSchema,
    // CF-91: un-collapsed combat result, retained for honest run-end draw
    // display. OPTIONAL (permissive) so a pre-CF-91 save lacking it still
    // validates rather than being hard-rejected — same load-boundary posture as
    // bossRewardItemId / bornFromRecipe below (VALIDATES, does not transform;
    // Rule 17). RunEndScreen falls back to `outcome` (W/L) when absent.
    combatOutcome: z.enum(['player_win', 'ghost_win', 'draw']).optional(),
    damageDealt: z.number(),
    damageTaken: z.number(),
    goldEarnedThisRound: z.number(),
    opponentGhostId: GhostIdSchema.nullable(),
    opponentClassId: ClassIdSchema.nullable(),
  })
  .readonly();

// ─── SerializedRunState + LocalSaveV1 ───────────────────────────────

const SerializedRunStateSchema = z
  .object({
    runId: RunIdSchema,
    seed: SimSeedSchema,
    classId: ClassIdSchema,
    contractId: ContractIdSchema,
    ruleset: RulesetSchema,
    derived: DerivedModifiersSchema,
    startedAt: IsoTimestampSchema,
    hearts: z.number(),
    gold: z.number(),
    currentRound: RoundNumberSchema,
    bag: BagStateSchema,
    relics: RelicSlotsSchema,
    // CF-67: boss-win reward item. OPTIONAL (permissive) so a pre-CF-67 save
    // lacking it still validates rather than being hard-rejected. Rule 17 applied
    // explicitly (NOT auto-inherited from the bornFromRecipe precedent): the load
    // boundary VALIDATES but does not transform — validateLocalSaveV1 returns
    // `safeParse(x).success` (a boolean) and loadLocal returns the RAW parsed
    // object, not Zod's `.data`, so a `.default(null)` here would be discarded and
    // give a false sense of a materialized default. Mechanism used: `.optional()`
    // (no `.default`) here + `?? null` at the consumption site (state.ts ctor
    // restore branch). `.optional()` also keeps the dual-satisfies bracket honest
    // against the OPTIONAL canonical RunState.bossRewardItemId field.
    bossRewardItemId: ItemIdSchema.nullable().optional(),
    shop: ShopStateSchema,
    trophiesAtStart: z.number(),
    history: z.array(RunHistoryEntrySchema).readonly(),
    outcome: RunOutcomeSchema,
    rngState: z.number(),
    rerollCount: z.number(),
    trophy: z.number(),
    // CF 43: recipe-born placement ids. OPTIONAL (permissive) — a pre-fix save
    // lacking this field still validates rather than being hard-rejected as the
    // required rngState/trophy fields would be. This boundary VALIDATES but does
    // not transform (validateLocalSaveV1 returns .success and loadLocal returns
    // the raw object), so a default here would be discarded; the empty-array
    // default materializes at the consumption point instead — restoreRun does
    // `restoreFrom.bornFromRecipe ?? []`. Optional (not required) keeps the type
    // guard honest: the field can genuinely be absent on a legacy load.
    bornFromRecipe: z.array(PlacementIdSchema).readonly().optional(),
    // CF-77 Phase 2 PR2: opaque per-run PUSH id (uuid v4). OPTIONAL — a legacy
    // save omits it and the client mints fresh on restore (safe: nothing was
    // pushed under it yet). This boundary VALIDATES but does not transform
    // (Rule 17), so NO `.default()`; the client owns the mint-vs-read-through
    // decision. `.optional()` (not required) keeps the dual-satisfies bracket
    // honest against the OPTIONAL canonical SerializedRunState.pushRunId.
    pushRunId: z.string().optional(),
  })
  .readonly();

const LocalSaveV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    trophies: z.number(),
    dailyStreak: z.number(),
    lastDailyAttempted: IsoDateSchema.nullable(),
    tutorialCompleted: z.boolean(),
    telemetryAnonId: z.string(),
    inProgressRun: SerializedRunStateSchema.nullable(),
  })
  .readonly();

// ─── Type-enforced completeness (dual-satisfies bracket) ────────────
// These assertions prove that the schema's inferred type is structurally
// EQUAL to the canonical SerializedRunState + LocalSaveV1, in both
// directions. If a field is missing from the schema OR an extra field is
// present OR a primitive type differs OR a brand is mis-mapped, one of
// the four `satisfies` clauses fails to compile.
//
// Sanity check: removing a field from any schema above (e.g. deleting
// `hearts: z.number(),` from SerializedRunStateSchema) causes
// the `_canonicalSatisfiesInferredSRS` assertion to fail at compile
// time with a "Property 'hearts' is missing" error. Verified locally
// pre-commit; do NOT regress.
//
// Prefer this dual-`satisfies` bracket over `Expect<Equal<A,B>>` — the
// latter is brittle on readonly/optional/index-signature variance and
// produces spurious failures. The dual-satisfies pattern is what
// TypeScript itself uses to verify bidirectional structural equality
// in test fixtures.

type InferredSerializedRunState = z.infer<typeof SerializedRunStateSchema>;
type InferredLocalSaveV1 = z.infer<typeof LocalSaveV1Schema>;

const _inferredSRSSatisfiesCanonical = null as unknown as InferredSerializedRunState satisfies SerializedRunState;
const _canonicalSatisfiesInferredSRS = null as unknown as SerializedRunState satisfies InferredSerializedRunState;
const _inferredLSV1SatisfiesCanonical = null as unknown as InferredLocalSaveV1 satisfies LocalSaveV1;
const _canonicalSatisfiesInferredLSV1 = null as unknown as LocalSaveV1 satisfies InferredLocalSaveV1;
// Consume the bindings to satisfy `no-unused-vars` while keeping the
// assertions load-bearing for the type checker.
void _inferredSRSSatisfiesCanonical;
void _canonicalSatisfiesInferredSRS;
void _inferredLSV1SatisfiesCanonical;
void _canonicalSatisfiesInferredLSV1;

/** Type predicate: narrows `parsed: unknown` to `LocalSaveV1` iff the
 *  payload passes the Zod schema. The schema validates the FULL
 *  contract (shape, primitive types, registry membership for id fields),
 *  so a true return guarantees that every downstream consumer's deref
 *  (`snapshot.ruleset.startingHearts`, `CLASSES[snapshot.classId]`,
 *  `ITEMS[bag.placements[i].itemId]`, `state.history[i].round`, etc.)
 *  is safe by construction. */
export function validateLocalSaveV1(parsed: unknown): parsed is LocalSaveV1 {
  return LocalSaveV1Schema.safeParse(parsed).success;
}
