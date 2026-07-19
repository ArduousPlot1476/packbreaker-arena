// Player-save store — DI seam over player_saves (M2.1 PR3; trophy write-path
// reworked in CF-77 Phase 2 PR1, idempotency-record fix in Codex round 1).
//
// CF-73 / Catch 58 — READ THIS BEFORE ADDING A FAKE-ONLY TEST. PR2's
// createAccountStore shipped with ZERO tests touching its real SQL: the
// route test injected a fake that HAND-MIRRORED the author's BELIEF about
// ON CONFLICT semantics, so the belief was never falsifiable. That is
// CF-70's exact anatomy. Rule 4 (broadened, decision-log.md 2026-07-14 §
// "M2.1 PR3 PHASE 1 RATIFIED"): "at least one test per external-SYSTEM
// boundary must exercise the REAL system's behaviour" — databases included.
// The fake is NOT the coverage story: __tests__/realsql/playerSaveStore.
// realsql.test.ts drives THIS module against real Postgres, and it is the
// ONLY place the idempotency gate + the loss-floor lock are asserted.
//
// TRUST MODEL — DELTA (CF-77 Phase 2). The client never sends a trophy value.
// `applyRoundResult` takes a completed round and computes the delta ITSELF via
// `trophyDeltaFor` — the SOLE schedule-derivation site (no SQL re-derivation of
// the win bonus or loss floor anywhere here; that would fork the derivation and
// reintroduce the CF-38 co-drift `trophyDeltaFor` exists to prevent).
//
// WRITE-VERSIONING — IDEMPOTENCY RECORD (Codex round 1 P1 fix). The first cut of
// this used a per-account last_run_id/last_round_applied tracker; Codex correctly
// showed it could not distinguish a genuinely-new run from a STALE retry of an
// older, already-superseded run (apply run-A r1 → run-B r1 → a delayed run-A r1
// retry looked "unseen" and re-credited). Replaced by an `applied_round_results`
// row per (account, run, round): the delta is applied AT MOST ONCE per tuple,
// because a second write of the same tuple conflicts on the composite PK and its
// INSERT ... ON CONFLICT DO NOTHING returns no row. This rejects duplicates,
// stale older-run retries, and concurrent double-fires uniformly. It enforces NO
// round ordering — a skip-ahead round is a never-seen tuple and applies (the old
// tracker's within-run skip-guard was incidental: its "unseen run" branch already
// accepted any round as a new run's first push, so global ordering was never
// enforced). See schema.ts appliedRoundResults + decision-log.md 2026-07-17
// § "CF-77 Phase 1 RATIFIED" (b36d3cc, superseded gate design).
//
// The SELECT ... FOR UPDATE on player_saves is STILL required, unchanged: on a
// genuinely-new claim the delta is computed in JS from the LOCKED current value,
// which is what keeps the loss floor correct under concurrent DIFFERENT-run
// writes (two round-1 losses near zero must net the floor, not below it — the
// second writer must see the first's committed, floored trophies).

import { eq, sql, type SQL } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { trophyDeltaFor } from '@packbreaker/sim'
import type { RoundOutcome } from '@packbreaker/content'
import type { WarnLogger } from '../logging.js'
import * as schema from './schema.js'

/** Postgres int4 ceiling. `player_saves.trophies` is int4, and the cumulative
 *  total has no upper bound of its own (Codex round 2 P2), so a running sum is
 *  SATURATED here — an overflow would otherwise throw `integer out of range` and
 *  the route's catch maps that to a RETRYABLE 503 for a request that can never
 *  succeed. Only the win path can reach it (loss deltas are non-positive after
 *  trophyDeltaFor's floor). This is a post-computation clamp, NOT schedule math —
 *  trophyDeltaFor stays the sole delta derivation; the cap never feeds back in. */
const INT4_MAX = 2_147_483_647

/** Server-derived daily streak (CF-68 PR-A — relocated from routes/playerSave.ts;
 *  PA7 / TT1: the BODY below is byte-unchanged, only its home moved). Pure — no
 *  DB, no clock. Driven by the SERVER-VERIFIED daily identity: the caller passes
 *  `nextLastDailyAttempted` = the matched daily date = `serverToday`, never a
 *  client claim.
 *
 *  RETAINED-DEAD BRANCHES (PA3 / TT1, decision-log.md 2026-07-18 § "CF-68 PR-A
 *  test-topology dispositions RATIFIED"): the store calls this ONLY on a
 *  daily-identity MATCH, which requires `dailyDate === serverToday`, so
 *  `nextLastDailyAttempted` is always a non-null value equal to `serverToday`.
 *  Branch 1 (`=== null → 0`) and branch 2 (`!== serverToday → prev`) are therefore
 *  PRODUCTION-UNREACHABLE. They are retained (byte-unchanged) and covered by the
 *  unit test, LABELLED retained-dead there so no future reader treats branch 1 as
 *  a live "no attempt" path; CF-82 may revisit their removal. The old inline
 *  comments below (their "through the route (400)" references) are HISTORICAL —
 *  the route-layer date gate was removed in this PR (PA9). */
export function deriveDailyStreak(input: {
  prevLastDailyAttempted: string | null
  prevDailyStreak: number
  nextLastDailyAttempted: string | null
  serverToday: string
}): number {
  // No attempt recorded ⇒ no streak. PR3's live path.
  if (input.nextLastDailyAttempted === null) return 0
  // Defence in depth: an attempt that is not TODAY is not a real attempt.
  // Unreachable through the route (400), so never advance a streak on it.
  if (input.nextLastDailyAttempted !== input.serverToday) {
    return input.prevDailyStreak
  }
  // Already counted today — a same-day re-PUT must not double-count.
  if (input.prevLastDailyAttempted === input.serverToday) {
    return input.prevDailyStreak
  }
  // Continued from yesterday.
  if (input.prevLastDailyAttempted === previousDay(input.serverToday)) {
    return input.prevDailyStreak + 1
  }
  // Never attempted, or a gap ⇒ restart at 1.
  return 1
}

/** The calendar day before `iso` (UTC). Relocated with deriveDailyStreak (PA7). */
function previousDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** A player_saves row as the routes see it. `updatedAt` is server-owned. */
export interface PlayerSaveRecord {
  readonly accountId: string
  readonly trophies: number
  readonly dailyStreak: number
  /** ISO `YYYY-MM-DD` (pg `date`, mode:'string'), or null if never attempted. */
  readonly lastDailyAttempted: string | null
  readonly updatedAt: Date
}

/** A completed-round report — the input to `applyRoundResult`. The trophy delta
 *  is NOT here (the server derives it from roundOutcome/round/current). Neither is
 *  `dailyStreak` any longer (CF-68 PR-A / PA7): the streak is DERIVED here, in the
 *  transaction, from server-verified participation — the route no longer computes
 *  it. */
export interface PlayerSaveRoundWrite {
  readonly accountId: string
  /** Opaque per-run id (uuid v4, client-minted) — never parsed here. */
  readonly runId: string
  readonly round: number
  readonly roundOutcome: RoundOutcome
  /** CF-68 PR-A daily-identity (PA2–PA6), as forwarded verbatim by the route from
   *  the request body. Both null on a non-daily push. NEVER trusted as-is: the
   *  store verifies them against the server ground truth below and writes
   *  participation + the derived streak ONLY on a match. */
  readonly dailyContractId: string | null
  readonly dailyDate: string | null
  /** Server ground truth for the daily-identity check, route-derived from the same
   *  clock as contract/daily.ts: today's UTC date and the server's daily contract
   *  id for today. The equality check lives HERE in the transaction — PA9 removed
   *  the route-layer date gate, and PA6 skips a mismatch SILENTLY (no 400). */
  readonly serverToday: string
  readonly serverDailyContractId: string
}

/** Narrow player-save persistence surface the routes depend on. */
export interface PlayerSaveStore {
  /** The account's save row, or null if it has never been written. */
  findByAccountId(accountId: string): Promise<PlayerSaveRecord | null>
  /** Applies one completed round's trophy delta AT MOST ONCE per
   *  (account, run, round), via an idempotency record. On a genuinely-new
   *  tuple it computes the delta from the locked current trophies and writes
   *  trophies + the server-derived daily fields. On a duplicate / stale /
   *  concurrent-double tuple it is a no-op and returns the current row. Returns
   *  the resulting row (absolute trophy total) for the GET-shaped response. */
  applyRoundResult(input: PlayerSaveRoundWrite): Promise<PlayerSaveRecord>
}

/** Builds the real store over a drizzle handle (player_saves schema). `log`
 *  follows the DI-seam logger pattern (posthog/db/clerk seams) — used only for
 *  the rare int4-saturation warning. */
export function createPlayerSaveStore(
  db: NodePgDatabase<typeof schema>,
  log: WarnLogger,
): PlayerSaveStore {
  return {
    async findByAccountId(accountId) {
      const rows = await db
        .select()
        .from(schema.playerSaves)
        .where(eq(schema.playerSaves.accountId, accountId))
        .limit(1)
      const row = rows[0]
      return row === undefined ? null : toRecord(row)
    },

    async applyRoundResult(input) {
      return db.transaction(async (tx) => {
        // Idempotency claim: record (account, run, round) as applied. The
        // composite PK means a duplicate — a same-run resend, a STALE retry of
        // an older superseded run (Codex round 1 P1), or a concurrent double-
        // fire — conflicts and returns no row.
        const claimed = await tx
          .insert(schema.appliedRoundResults)
          .values({
            accountId: input.accountId,
            runId: input.runId,
            round: input.round,
          })
          .onConflictDoNothing()
          .returning()

        if (claimed.length === 0) {
          // Already applied — trophy no-op. Return the current save unchanged;
          // no mutation and no updatedAt advance (a true idempotent no-op). The
          // daily fields on THIS push are dropped, which is correct: they are
          // orthogonal and idempotent, and were recorded on the round's FIRST
          // apply. A save row is guaranteed to exist (an applied record implies
          // a prior apply created it); the ensure-insert is belt-and-suspenders
          // for the impossible record-without-save state so the response stays
          // coherent rather than 503-ing.
          await tx
            .insert(schema.playerSaves)
            .values({ accountId: input.accountId })
            .onConflictDoNothing({ target: schema.playerSaves.accountId })
          const cur = await tx
            .select()
            .from(schema.playerSaves)
            .where(eq(schema.playerSaves.accountId, input.accountId))
            .limit(1)
          return toRecord(requireRow(cur))
        }

        // Genuinely new (account, run, round). Ensure the player_saves row
        // exists and LOCK it — required for the loss floor under concurrent
        // DIFFERENT-run writes (the delta below is computed from the locked
        // value, so a second concurrent writer sees this write's committed,
        // floored result before computing its own).
        await tx
          .insert(schema.playerSaves)
          .values({ accountId: input.accountId })
          .onConflictDoNothing({ target: schema.playerSaves.accountId })
        const locked = await tx
          .select()
          .from(schema.playerSaves)
          .where(eq(schema.playerSaves.accountId, input.accountId))
          .for('update')
        const row = requireRow(locked)

        // trophyDeltaFor is the SOLE schedule derivation, from the LOCKED
        // current trophy. Under the lock row.trophies is the value the sum
        // applies to, so writing the computed absolute is equivalent to the
        // atomic increment. The running total is SATURATED at INT4_MAX (Codex
        // round 2 P2) — a post-computation clamp, never fed back into the
        // schedule. The loss floor lives entirely inside trophyDeltaFor.
        const delta = trophyDeltaFor(input.roundOutcome, input.round, row.trophies)
        const rawTotal = row.trophies + delta
        const newTotal = Math.min(rawTotal, INT4_MAX)
        if (rawTotal > INT4_MAX) {
          log.warn(
            `player_saves.trophies clamped at int4 max (${INT4_MAX}) for account ` +
              `${input.accountId}: cumulative total ${rawTotal} would overflow the column`,
          )
        }
        // The UPDATE always writes trophies + updatedAt. The daily streak fields
        // are added ONLY on a verified daily match — PA3 hard invariant: a neutral
        // or identity-mismatched round moves NEITHER dailyStreak NOR
        // last_daily_attempted.
        const set: {
          trophies: number
          updatedAt: SQL
          dailyStreak?: number
          lastDailyAttempted?: string
        } = { trophies: newTotal, updatedAt: sql`now()` }

        // CF-68 PR-A daily participation (PA3–PA6). DAILY-BEARING iff both identity
        // fields are present; MATCHES iff the claimed date is server-today AND the
        // claimed contract id is the server's daily contract id for today (both
        // re-derived server-side and forwarded by the route). The equality check
        // lives HERE, under the same row lock that serializes the trophy delta
        // (PA4). PA6: a non-daily or MISMATCHED push skips silently — no error, the
        // round push still succeeds. The `!== null` guards narrow both fields to
        // string for the participation insert.
        if (
          input.dailyContractId !== null &&
          input.dailyDate !== null &&
          input.dailyDate === input.serverToday &&
          input.dailyContractId === input.serverDailyContractId
        ) {
          // Per-DAY participation, ON CONFLICT DO NOTHING on (account_id,
          // daily_date): round 2+ of the same daily run collides by construction
          // and no-ops (PA5). applied_round_results stays fenced.
          await tx
            .insert(schema.dailyParticipation)
            .values({
              accountId: input.accountId,
              dailyDate: input.dailyDate,
              runId: input.runId,
              contractId: input.dailyContractId,
            })
            .onConflictDoNothing()
          // Derive UNCONDITIONALLY when matched, regardless of whether the insert
          // above returned a row (PA3 clarification, decision-log.md 2026-07-18
          // § "CF-68 PR-A test-topology dispositions RATIFIED"): on rounds 2+ the
          // insert ON CONFLICT no-ops and deriveDailyStreak's same-day guard
          // returns the already-persisted streak, so the write is a no-op-
          // equivalent — identical persisted state either way. nextLastDailyAttempted
          // is the verified daily date (= serverToday), never a client claim.
          set.dailyStreak = deriveDailyStreak({
            prevLastDailyAttempted: row.lastDailyAttempted,
            prevDailyStreak: row.dailyStreak,
            nextLastDailyAttempted: input.dailyDate,
            serverToday: input.serverToday,
          })
          set.lastDailyAttempted = input.dailyDate
        }

        const updated = await tx
          .update(schema.playerSaves)
          .set(set)
          .where(eq(schema.playerSaves.accountId, input.accountId))
          .returning()
        return toRecord(requireRow(updated))
      })
    },
  }
}

function requireRow(
  rows: ReadonlyArray<typeof schema.playerSaves.$inferSelect>,
): typeof schema.playerSaves.$inferSelect {
  const row = rows[0]
  if (row === undefined) {
    // Unreachable: every path ensures/locks the row by PK before this.
    throw new Error('player_saves row missing')
  }
  return row
}

function toRecord(row: typeof schema.playerSaves.$inferSelect): PlayerSaveRecord {
  return {
    accountId: row.accountId,
    trophies: row.trophies,
    dailyStreak: row.dailyStreak,
    lastDailyAttempted: row.lastDailyAttempted,
    updatedAt: row.updatedAt,
  }
}
