// Zod validator for PUT /v1/player/save (M2.1 PR3; reshaped CF-77 Phase 2 PR1).
//
// Mirrors validation/accountLink.ts: a standalone schema module + safeParse
// entrypoint; the route maps !success → 400 and .data → handler. The account
// is identified server-side by the authenticated Clerk userId, NEVER from the
// body.
//
// TRUST MODEL — DELTA (CF-77 Phase 2, decision-log.md 2026-07-17 § "CF-77
// Phase 1 RATIFIED"). The client NEVER sends a trophy value: it reports one
// completed round (`runId`, `round`, `roundOutcome`) and the SERVER computes
// the trophy delta via `trophyDeltaFor` (db/playerSaveStore.ts applyRoundResult),
// applied under a round-ordering guard. So there is no client-supplied trophy
// to bound here at all — the old int4 `trophies` bound (Codex round 1 P2) is
// gone with the field. `round` gets a bound instead (see MAX_ROUND).
//
// `dailyStreak` IS DELIBERATELY ABSENT, and `.strict()` is what enforces
// that: per decision-log.md 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED",
// "dailyStreak is NEVER client-settable — always server-derived". A body
// carrying it is an unrecognized key → 400, rather than being silently
// dropped. Silent-drop would let a client believe it set the streak; the
// 400 tells it the field is not its to write.
//
// Unlike dailyContract.ts (which regex-checks the server's OWN output),
// this is UNTRUSTED input, so the date is checked for real-calendar
// validity too — `2026-02-30` matches the regex but would blow up at the
// pg `date` insert as a 500 instead of an honest 400.

import { z } from 'zod'
import type { RoundOutcome } from '@packbreaker/content'

/** Opaque per-run id (PR2 mints a uuid v4). The server never parses it — it is
 *  a key for the round-ordering guard only. uuid v4 is 36 chars; the cap is
 *  generous headroom while still bounding what lands in the `last_run_id` text
 *  column. */
const RUN_ID_MAX = 128

/** Anti-abuse ceiling for `round` — NOT a game rule. Real contracts top out
 *  near a dozen rounds (boss at 11); this sits far above any of them, so it
 *  never rejects a legitimate round. Its job is to bound the win delta
 *  (trophyDeltaFor = 2·round+8) so a FORGED first-push round on an unseen run
 *  can't drive trophies toward int4 overflow: the round-ordering gate blocks
 *  sequential skip-ahead, but an unseen run resets the tracker to the incoming
 *  round, and that one entry point still needs a ceiling. Comfortably int4. */
const MAX_ROUND = 10_000

/** The round outcomes the trophy schedule can score. Must stay EXACTLY in step
 *  with content's `RoundOutcome` union — a divergence would let the validator
 *  accept an outcome `trophyDeltaFor` can't score, or reject one it can. */
const ROUND_OUTCOMES = ['win', 'loss'] as const
type TupleOutcome = (typeof ROUND_OUTCOMES)[number]
// Compile-time exhaustiveness in BOTH directions (mirrors the `never`-guard
// idiom used for reducer actions): fails to compile if the tuple and the union
// stop covering each other.
type _Assert<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never
const _outcomeExhaustive: _Assert<TupleOutcome, RoundOutcome> = true
void _outcomeExhaustive

/** True iff `s` is a real calendar date, not merely YYYY-MM-DD shaped.
 *  Round-trip catches rollovers: `2026-02-30` → Mar 2 → mismatch. */
function isRealCalendarDate(s: string): boolean {
  const parsed = new Date(`${s}T00:00:00Z`)
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === s
  )
}

/** ISO calendar date (YYYY-MM-DD). Erases to a plain string on the wire —
 *  `IsoDate` (content-schemas § 17) is a compile-time brand only. */
export const IsoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)')
  .refine(isRealCalendarDate, 'not a real calendar date')

export const PlayerSaveWriteRequestSchema = z
  .object({
    /** Opaque per-run id for the round-ordering guard (see RUN_ID_MAX). */
    runId: z.string().min(1).max(RUN_ID_MAX),
    /** The completed round being reported. Bounded (see MAX_ROUND) so a forged
     *  round can't overflow the int4 trophies column via the win delta. */
    round: z.number().int().min(1).max(MAX_ROUND),
    /** Server derives the trophy delta from this; the client sends no trophy. */
    roundOutcome: z.enum(ROUND_OUTCOMES),
    /** null = the player has never attempted a daily. */
    lastDailyAttempted: IsoDateSchema.nullable(),
  })
  .strict()

export type ParsedPlayerSaveWrite = z.infer<typeof PlayerSaveWriteRequestSchema>

export function parsePlayerSaveWrite(body: unknown) {
  return PlayerSaveWriteRequestSchema.safeParse(body)
}
