// Player-save store — DI seam over the player_saves table (M2.1 PR3; trophy
// write-path reworked in CF-77 Phase 2 PR1).
//
// CF-73 / Catch 58 — READ THIS BEFORE ADDING A FAKE-ONLY TEST. PR2's
// createAccountStore shipped with ZERO tests touching its real SQL: the
// route test injected a fake that HAND-MIRRORED the author's BELIEF about
// ON CONFLICT semantics, so the belief was never falsifiable. That is
// CF-70's exact anatomy (verifier.ts believed verifyToken returned
// `{data, errors}`; both pass forever if the belief is wrong). Rule 4, as
// broadened at decision-log.md 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED",
// now reads: "at least one test per external-SYSTEM boundary must exercise
// the REAL system's behaviour, not an assumed one" — databases included.
// The fake below is therefore NOT the coverage story: __tests__/realsql/
// playerSaveStore.realsql.test.ts drives THIS module against a real Postgres,
// and it is the ONLY place the round-ordering gate + delta apply are asserted.
//
// TRUST MODEL — DELTA (CF-77 Phase 2, decision-log.md 2026-07-17 § "CF-77
// Phase 1 RATIFIED"). The client never sends a trophy value. `applyRoundResult`
// takes a completed round (runId / round / roundOutcome) and:
//   - computes the trophy delta ITSELF via `trophyDeltaFor` — the SOLE
//     schedule-derivation site (no SQL-side re-derivation of the win bonus or
//     loss floor anywhere in this file: that would fork the derivation and
//     reintroduce the CF-38 co-drift `trophyDeltaFor` exists to prevent);
//   - applies it only when the round-ordering guard accepts (facet 3), so
//     concurrent / out-of-order / duplicate pushes cannot double-apply or
//     clobber.
//
// WRITE FORM — Form ① (row-locked, JS-evaluated). The delta is computed in JS,
// which is a read-modify-write; it is made race-safe by doing the whole thing
// inside a transaction that holds `SELECT … FOR UPDATE` on the row, so the
// value the delta is computed from is the value the increment applies to. This
// is a deliberate refinement of the Phase-1 ratification's literal phrasing
// ("atomic increment … NOT a read-modify-write"): `trophyDeltaFor`'s LOSS branch
// floors at zero against the CURRENT trophy, so it is current-dependent and a
// bare single-statement `trophies = trophies + <js-delta>` computed from a
// separate read is race-unsafe for concurrent different-run writes (two round-1
// losses near the floor would net below zero). Ruled Form ① at decision-log.md
// 2026-07-17 § "CF-77 Phase 2 PR1 …" — the row lock preserves the ratification's
// INTENT (no lost update, server-authoritative delta) while keeping
// trophyDeltaFor the single derivation.

import { eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { trophyDeltaFor } from '@packbreaker/sim'
import type { RoundOutcome } from '@packbreaker/content'
import * as schema from './schema.js'

/** A player_saves row as the routes see it. `updatedAt` is server-owned;
 *  `lastRunId` / `lastRoundApplied` are the CF-77 round-ordering tracker. */
export interface PlayerSaveRecord {
  readonly accountId: string
  readonly trophies: number
  readonly dailyStreak: number
  /** ISO `YYYY-MM-DD` (pg `date`, mode:'string'), or null if never attempted. */
  readonly lastDailyAttempted: string | null
  /** Round-ordering tracker (CF-77 Phase 2). Null until the first trophy write. */
  readonly lastRunId: string | null
  readonly lastRoundApplied: number | null
  readonly updatedAt: Date
}

/** A completed-round report — the input to `applyRoundResult`. The trophy
 *  delta is NOT here: the server derives it from (roundOutcome, round,
 *  current). `dailyStreak` IS here because the ROUTE derives it server-side
 *  (never from the request body); it is written unconditionally, orthogonal to
 *  the round-ordering guard. */
export interface PlayerSaveRoundWrite {
  readonly accountId: string
  /** Opaque per-run id (uuid v4, client-minted) — never parsed here. */
  readonly runId: string
  readonly round: number
  readonly roundOutcome: RoundOutcome
  readonly dailyStreak: number
  readonly lastDailyAttempted: string | null
}

/** Narrow player-save persistence surface the routes depend on. */
export interface PlayerSaveStore {
  /** The account's save row, or null if it has never been written. */
  findByAccountId(accountId: string): Promise<PlayerSaveRecord | null>
  /** Applies one completed round's trophy delta under the round-ordering guard,
   *  and writes the (server-derived) daily fields unconditionally. Returns the
   *  resulting row (with the new ABSOLUTE trophy total for the GET-shaped
   *  response). Idempotent for a duplicate / out-of-order round: the trophy
   *  half no-ops, the daily half still applies. */
  applyRoundResult(input: PlayerSaveRoundWrite): Promise<PlayerSaveRecord>
}

/** Builds the real store over a drizzle handle (player_saves schema). */
export function createPlayerSaveStore(
  db: NodePgDatabase<typeof schema>,
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
        // Ensure a row exists to lock. A fresh account has no player_saves row
        // until its first write (GET returns defaults without inserting;
        // account-link creates only the accounts row), so this is the reachable
        // first-write path. ON CONFLICT DO NOTHING makes it a no-op when the row
        // is already there, and collapses the concurrent-first-write race into
        // the same FOR UPDATE lock path as every other write. If the account_id
        // has no accounts row, the FK fires here and rolls the txn back — the
        // route never reaches this (it 404s first); the realsql FK test does.
        await tx
          .insert(schema.playerSaves)
          .values({ accountId: input.accountId })
          .onConflictDoNothing({ target: schema.playerSaves.accountId })

        // Lock the row for the rest of the transaction. Concurrent writers block
        // here until we commit, so each sees the others' committed effect — the
        // property Form ① relies on for the current-dependent loss floor.
        const locked = await tx
          .select()
          .from(schema.playerSaves)
          .where(eq(schema.playerSaves.accountId, input.accountId))
          .for('update')
        const row = locked[0]
        if (row === undefined) {
          // Unreachable: the upsert above guarantees a row unless the FK threw
          // (and then we never get here). Guard rather than assert.
          throw new Error('player_saves row missing after ensure-exists insert')
        }

        // ── Round-ordering gate, evaluated in JS against the LOCKED row ──
        // Accept iff the run is unseen (new run → take the incoming round as the
        // new baseline) OR the round is strictly the next one for the run we are
        // already tracking. Everything else — duplicate resend, skip-ahead,
        // stale retry — no-ops the trophy half.
        const unseenRun = row.lastRunId !== input.runId
        const nextInSequence =
          row.lastRunId === input.runId &&
          row.lastRoundApplied !== null &&
          input.round === row.lastRoundApplied + 1
        const applyTrophy = unseenRun || nextInSequence

        // Daily fields are server-derived and orthogonal to the trophy guard —
        // always written (their own idempotency lives in deriveDailyStreak).
        if (applyTrophy) {
          // trophyDeltaFor is the SOLE schedule derivation, computed from the
          // LOCKED current trophy. The SQL `trophies + :delta` is an atomic
          // increment of that same locked value (no stale-read gap under the
          // lock); the loss floor lives entirely inside trophyDeltaFor, never
          // re-expressed in SQL.
          const delta = trophyDeltaFor(input.roundOutcome, input.round, row.trophies)
          const updated = await tx
            .update(schema.playerSaves)
            .set({
              trophies: sql`${schema.playerSaves.trophies} + ${delta}`,
              lastRunId: input.runId,
              lastRoundApplied: input.round,
              dailyStreak: input.dailyStreak,
              lastDailyAttempted: input.lastDailyAttempted,
              updatedAt: sql`now()`,
            })
            .where(eq(schema.playerSaves.accountId, input.accountId))
            .returning()
          return toRecord(requireRow(updated))
        }

        const updated = await tx
          .update(schema.playerSaves)
          .set({
            dailyStreak: input.dailyStreak,
            lastDailyAttempted: input.lastDailyAttempted,
            updatedAt: sql`now()`,
          })
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
    // Unreachable: the UPDATE targets the row we just locked by PK.
    throw new Error('player_saves update returned no row')
  }
  return row
}

function toRecord(row: typeof schema.playerSaves.$inferSelect): PlayerSaveRecord {
  return {
    accountId: row.accountId,
    trophies: row.trophies,
    dailyStreak: row.dailyStreak,
    lastDailyAttempted: row.lastDailyAttempted,
    lastRunId: row.lastRunId,
    lastRoundApplied: row.lastRoundApplied,
    updatedAt: row.updatedAt,
  }
}
