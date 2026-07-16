// Zod validator for PUT /v1/player/save (M2.1 PR3).
//
// Mirrors validation/accountLink.ts: a standalone schema module +
// safeParse entrypoint; the route maps !success → 400 and .data → handler.
// The account is identified server-side by the authenticated Clerk userId,
// NEVER from the body.
//
// `dailyStreak` IS DELIBERATELY ABSENT, and `.strict()` is what enforces
// that: per decision-log.md 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED",
// "dailyStreak is NEVER client-settable — always server-derived". A body
// carrying it is an unrecognized key → 400, rather than being silently
// dropped. Silent-drop would let a client believe it set the streak; the
// 400 tells it the field is not its to write.
//
// `trophies` is SIGNED with NO lower bound — gdd.md § 13 ("Lose →
// -trophies") makes trophies non-monotonic. Matching the table's
// deliberate absence of a CHECK constraint (db/schema.ts). The trophy
// TRUST-model (absolute vs delta vs replay-validated) is CF-72 and stays
// open; it does not bind here because PR3 only ever pushes zero.
//
// Unlike dailyContract.ts (which regex-checks the server's OWN output),
// this is UNTRUSTED input, so the date is checked for real-calendar
// validity too — `2026-02-30` matches the regex but would blow up at the
// pg `date` insert as a 500 instead of an honest 400.

import { z } from 'zod'

/** Postgres `integer` (int4) bounds. `player_saves.trophies` is int4
 *  (db/schema.ts), so a value outside this range is a BAD PAYLOAD, not a
 *  database outage — and the difference is user-visible. Unbounded, an
 *  out-of-range value passed validation, reached the INSERT, and Postgres
 *  rejected it; the route's catch-all then mapped that to a RETRYABLE 503
 *  db_unavailable, telling the client to try again later for a request that
 *  can never succeed. Bounded here, it is an honest 400 invalid_body.
 *  (Codex round 1, P2.)
 *
 *  Bounding rather than widening the column: int4 is ratified, and the
 *  trophy schedule (CF-72) gives no reason to expect values near 2^31. */
const PG_INT4_MIN = -2_147_483_648
const PG_INT4_MAX = 2_147_483_647

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
    /** Signed on purpose (see header), but bounded to the int4 column's
     *  range so an oversized value is a 400, not a 503. The LOWER bound is
     *  the column limit, NOT a non-negativity floor — negative trophies stay
     *  legal (gdd § 13). */
    trophies: z.number().int().min(PG_INT4_MIN).max(PG_INT4_MAX),
    /** null = the player has never attempted a daily. */
    lastDailyAttempted: IsoDateSchema.nullable(),
  })
  .strict()

export type ParsedPlayerSaveWrite = z.infer<typeof PlayerSaveWriteRequestSchema>

export function parsePlayerSaveWrite(body: unknown) {
  return PlayerSaveWriteRequestSchema.safeParse(body)
}
