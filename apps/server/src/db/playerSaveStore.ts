// Player-save store — DI seam over the player_saves table (M2.1 PR3).
//
// Mirrors db/accountStore.ts (itself the CF-49 posthog-sink pattern):
// `PlayerSaveStore` is the narrow interface the routes depend on, NOT
// drizzle's full surface. Tests inject an in-memory fake for the route's
// status-map paths.
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
// The fake below is therefore NOT the coverage story: __tests__/
// playerSaveStore.realsql.test.ts drives THIS module against a real
// Postgres, and the same harness closes CF-73 for AccountStore.

import { eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

/** A player_saves row as the routes see it. `updatedAt` is server-owned. */
export interface PlayerSaveRecord {
  readonly accountId: string
  readonly trophies: number
  readonly dailyStreak: number
  /** ISO `YYYY-MM-DD` (pg `date`, mode:'string'), or null if never attempted. */
  readonly lastDailyAttempted: string | null
  readonly updatedAt: Date
}

/** The fields a write supplies. `dailyStreak` is included because the ROUTE
 *  derives it server-side — it is never taken from the request body. */
export interface PlayerSaveWrite {
  readonly accountId: string
  readonly trophies: number
  readonly dailyStreak: number
  readonly lastDailyAttempted: string | null
}

/** Narrow player-save persistence surface the routes depend on. */
export interface PlayerSaveStore {
  /** The account's save row, or null if it has never been written. */
  findByAccountId(accountId: string): Promise<PlayerSaveRecord | null>
  /** Inserts the row, or updates it if one already exists
   *  (`ON CONFLICT (account_id) DO UPDATE`). Returns the persisted row.
   *  Upsert — not insert-then-update — so a concurrent first-write cannot
   *  500 on the primary key (R2 precedent: PR2's account create). */
  upsert(input: PlayerSaveWrite): Promise<PlayerSaveRecord>
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
    async upsert(input) {
      const rows = await db
        .insert(schema.playerSaves)
        .values({
          accountId: input.accountId,
          trophies: input.trophies,
          dailyStreak: input.dailyStreak,
          lastDailyAttempted: input.lastDailyAttempted,
        })
        .onConflictDoUpdate({
          target: schema.playerSaves.accountId,
          set: {
            trophies: input.trophies,
            dailyStreak: input.dailyStreak,
            lastDailyAttempted: input.lastDailyAttempted,
            // Server clock, not a client value — a write always advances
            // updatedAt even when every other column is byte-identical.
            updatedAt: sql`now()`,
          },
        })
        .returning()
      const row = rows[0]
      if (row === undefined) {
        // Unreachable: DO UPDATE always returns the row (unlike DO NOTHING,
        // which returns nothing on conflict). Guard rather than assert —
        // a silent undefined here would surface as a confusing 500.
        throw new Error('player_saves upsert returned no row')
      }
      return toRecord(row)
    },
  }
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
