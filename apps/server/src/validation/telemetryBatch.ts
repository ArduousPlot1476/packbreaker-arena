// Zod validator for POST /v1/telemetry/batch (M1.5c PR 2 / CF 49).
//
// tech-architecture.md § 6.4: "Server validates with Zod schemas." The
// canonical TypeScript lives in packages/content/src/schemas.ts § 14/15
// (TelemetryBatchRequest + the 20-variant TelemetryEvent union, verified
// verbatim at Step 0). This module is the WIRE-SHAPE gate — it validates
// structure, NOT registry membership (unlike the client's persistence
// validate.ts, the server forwards opaquely to PostHog and never derefs
// a RelicId etc.).
//
// Format policy (ratified Phase 2):
//   - LENIENT on format: branded string IDs + IsoTimestamp + IsoDate are
//     z.string().min(1). The brand is erased to plain `string` in
//     z.infer — accepted, see the satisfies note below.
//   - STRICT on structure: events.min(1), anonId.min(1), every variant
//     object is .strict() (no passthrough — unknown keys reject), the
//     discriminated union rejects unknown `name`s.
//
// FOUR-LAYER completeness net (no single layer is sufficient):
//   1. assertNever(name) over TelemetryEventName — compile-time gate on
//      variant NAME completeness (a 21st canonical variant fails tsc).
//   2. `TelemetryEvent satisfies Inferred` (one direction only) —
//      compile-time gate on extra/renamed properties + extra variant
//      members. The reverse direction is intentionally OMITTED: lenient
//      z.string() widens RunId→string, so `Inferred satisfies Canonical`
//      would false-fail on every brand. Do NOT add it (and do NOT use
//      Equals<>).
//   3. .strict() + per-variant full-payload round-trip tests — runtime
//      gate on DROPPED properties (a dropped field becomes an unknown
//      key on the full payload → strict rejects → test fails).
//   4. Literal-enumeration tests — runtime gate on narrowed literal
//      unions (a too-narrow z.enum is invisible to layers 1-2 because
//      z.infer reports plain string across the brand boundary).

import { z } from 'zod'
import type {
  TelemetryBatchRequest,
  TelemetryEvent,
  TelemetryEventName,
} from '@packbreaker/content'

// ─── Lenient leaf schemas (brand erased to string/number) ────────────

/** Branded string IDs + IsoTimestamp/IsoDate all serialize as plain
 *  non-empty strings on the wire (telemetry-plan.md § 8). */
const idString = z.string().min(1)
/** SimSeed (Brand<number>), RoundNumber (= number), and all plain
 *  numeric props (cost, damage, ticks, hearts, gold, …). Lenient on
 *  integer-ness — a non-integer is a client bug we'd rather forward
 *  (observable) than silently drop. */
const num = z.number()

// ─── Closed literal-union schemas (exact member sets, verbatim) ──────
// schemas.ts:526 / :507 / :687 / :900 / :167. Exported so the literal-
// enumeration tests can exercise each member + a known non-member.

export const RunOutcomeSchema = z.enum([
  'in_progress',
  'won',
  'eliminated',
  'abandoned',
])
export const RoundOutcomeSchema = z.enum(['win', 'loss'])
export const CombatOutcomeSchema = z.enum(['player_win', 'ghost_win', 'draw'])
export const RelicSlotSchema = z.enum(['mid', 'boss'])
export const RotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
])

/** CellCoord (schemas.ts:161-164). */
const CellCoordSchema = z.object({ col: num, row: num }).strict()

// ─── TelemetryBase (schemas.ts:804-807), spread into every variant ───

const baseShape = {
  tsClient: idString,
  sessionId: idString,
}

// ─── 20 variant schemas (authored verbatim from schemas.ts:809-948) ──

const runStart = z
  .object({ ...baseShape, name: z.literal('run_start'), runId: idString, classId: idString, contractId: idString, seed: num, startingRelicId: idString })
  .strict()
const runEnd = z
  .object({ ...baseShape, name: z.literal('run_end'), runId: idString, outcome: RunOutcomeSchema, roundReached: num, heartsRemaining: num })
  .strict()
const roundStart = z
  .object({ ...baseShape, name: z.literal('round_start'), runId: idString, round: num, hearts: num, gold: num, itemsInBag: num })
  .strict()
const roundEnd = z
  .object({ ...baseShape, name: z.literal('round_end'), runId: idString, round: num, outcome: RoundOutcomeSchema, damageDealt: num, damageTaken: num })
  .strict()
const shopPurchase = z
  .object({ ...baseShape, name: z.literal('shop_purchase'), runId: idString, round: num, itemId: idString, cost: num })
  .strict()
const shopSell = z
  .object({ ...baseShape, name: z.literal('shop_sell'), runId: idString, round: num, itemId: idString, recovered: num })
  .strict()
const shopReroll = z
  .object({ ...baseShape, name: z.literal('shop_reroll'), runId: idString, round: num, cost: num, rerollIndex: num })
  .strict()
const itemPlaced = z
  .object({ ...baseShape, name: z.literal('item_placed'), runId: idString, itemId: idString, placementId: idString, anchor: CellCoordSchema, rotation: RotationSchema })
  .strict()
const itemRotated = z
  .object({ ...baseShape, name: z.literal('item_rotated'), runId: idString, placementId: idString, newRotation: RotationSchema })
  .strict()
const itemMoved = z
  .object({ ...baseShape, name: z.literal('item_moved'), runId: idString, placementId: idString, newAnchor: CellCoordSchema })
  .strict()
const recipeCompleted = z
  .object({ ...baseShape, name: z.literal('recipe_completed'), runId: idString, recipeId: idString, round: num })
  .strict()
const relicGranted = z
  .object({ ...baseShape, name: z.literal('relic_granted'), runId: idString, slot: RelicSlotSchema, relicId: idString, round: num })
  .strict()
const combatStart = z
  .object({ ...baseShape, name: z.literal('combat_start'), runId: idString, round: num, opponentGhostId: idString.nullable() })
  .strict()
const combatEnd = z
  .object({ ...baseShape, name: z.literal('combat_end'), runId: idString, round: num, outcome: CombatOutcomeSchema, endedAtTick: num, damageDealt: num, damageTaken: num })
  .strict()
const tutorialStepReached = z
  .object({ ...baseShape, name: z.literal('tutorial_step_reached'), stepId: z.string().min(1) })
  .strict()
const tutorialCompleted = z
  .object({ ...baseShape, name: z.literal('tutorial_completed') })
  .strict()
const tutorialAbandoned = z
  .object({ ...baseShape, name: z.literal('tutorial_abandoned'), stepId: z.string().min(1) })
  .strict()
const dailyContractStarted = z
  .object({ ...baseShape, name: z.literal('daily_contract_started'), contractId: idString, date: idString })
  .strict()
const dailyContractCompleted = z
  .object({ ...baseShape, name: z.literal('daily_contract_completed'), contractId: idString, date: idString, outcome: RunOutcomeSchema })
  .strict()
const errorBoundaryCaught = z
  .object({ ...baseShape, name: z.literal('error_boundary_caught'), errorMessage: z.string(), componentStack: z.string() })
  .strict()

export const TelemetryEventSchema = z.discriminatedUnion('name', [
  runStart,
  runEnd,
  roundStart,
  roundEnd,
  shopPurchase,
  shopSell,
  shopReroll,
  itemPlaced,
  itemRotated,
  itemMoved,
  recipeCompleted,
  relicGranted,
  combatStart,
  combatEnd,
  tutorialStepReached,
  tutorialCompleted,
  tutorialAbandoned,
  dailyContractStarted,
  dailyContractCompleted,
  errorBoundaryCaught,
])

export const TelemetryBatchRequestSchema = z
  .object({
    anonId: z.string().min(1),
    clientVersion: z.string().min(1),
    // .readonly() so the inferred events type is `readonly E[]`, matching
    // canonical `ReadonlyArray<TelemetryEvent>` — a readonly array is NOT
    // assignable to a mutable one (the array exception to readonly
    // variance), so without this the satisfies gate fails.
    events: z.array(TelemetryEventSchema).min(1).readonly(),
  })
  .strict()

// ─── Layer 1: variant-name exhaustiveness gate (compile-time) ────────

function assertNever(x: never): never {
  throw new Error(`unhandled telemetry variant: ${String(x)}`)
}

/** Hard tsc gate on variant-NAME completeness. Every TelemetryEventName
 *  must appear here AND as a z.literal member above. Adding a 21st
 *  variant to the canonical union without updating both fails to compile
 *  at the assertNever call (the new name is not narrowed to `never`). */
function _assertVariantNamesExhaustive(name: TelemetryEventName): void {
  switch (name) {
    case 'run_start':
    case 'run_end':
    case 'round_start':
    case 'round_end':
    case 'shop_purchase':
    case 'shop_sell':
    case 'shop_reroll':
    case 'item_placed':
    case 'item_rotated':
    case 'item_moved':
    case 'recipe_completed':
    case 'relic_granted':
    case 'combat_start':
    case 'combat_end':
    case 'tutorial_step_reached':
    case 'tutorial_completed':
    case 'tutorial_abandoned':
    case 'daily_contract_started':
    case 'daily_contract_completed':
    case 'error_boundary_caught':
      return
    default:
      assertNever(name)
  }
}
void _assertVariantNamesExhaustive

// ─── Layer 2: structural satisfies (compile-time, ONE direction) ─────
// `Canonical satisfies Inferred` survives the lenient z.string() brand
// erasure and catches extra/renamed properties + extra variant members.
// The reverse (Inferred satisfies Canonical) is intentionally omitted —
// it false-fails because z.infer reports `string` where canonical has
// `RunId`. See header layer notes.

type InferredTelemetryEvent = z.infer<typeof TelemetryEventSchema>
type InferredTelemetryBatchRequest = z.infer<typeof TelemetryBatchRequestSchema>

const _canonicalEventSatisfiesInferred =
  null as unknown as TelemetryEvent satisfies InferredTelemetryEvent
const _canonicalBatchSatisfiesInferred =
  null as unknown as TelemetryBatchRequest satisfies InferredTelemetryBatchRequest
void _canonicalEventSatisfiesInferred
void _canonicalBatchSatisfiesInferred

// ─── Parse entrypoint ────────────────────────────────────────────────

/** The brand-erased batch shape (plain strings where canonical carries
 *  RunId/IsoTimestamp/etc.). The route + forwarder operate on this —
 *  the server forwards opaquely to PostHog and never derefs a branded
 *  id, so the brand is not needed past the wire boundary. Equal to the
 *  canonical TelemetryBatchRequest modulo brand erasure (proven by the
 *  satisfies gate above). */
export type ParsedTelemetryBatch = z.infer<typeof TelemetryBatchRequestSchema>
export type ParsedTelemetryEvent = z.infer<typeof TelemetryEventSchema>

/** safeParse a request body against the batch schema. The route maps
 *  `.success === false` → 400 and a successful parse → forward + 204. */
export function parseTelemetryBatch(body: unknown) {
  return TelemetryBatchRequestSchema.safeParse(body)
}
