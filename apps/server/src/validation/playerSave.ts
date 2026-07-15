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
    /** Signed on purpose — see header. */
    trophies: z.number().int(),
    /** null = the player has never attempted a daily. */
    lastDailyAttempted: IsoDateSchema.nullable(),
  })
  .strict()

export type ParsedPlayerSaveWrite = z.infer<typeof PlayerSaveWriteRequestSchema>

export function parsePlayerSaveWrite(body: unknown) {
  return PlayerSaveWriteRequestSchema.safeParse(body)
}
