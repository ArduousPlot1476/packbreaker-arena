// Drizzle schema — M2 accounts table (M2 PR1).
//
// Minimal account row: links a Clerk user to the pre-account device
// identity (telemetryAnonId) captured at signup. `anonIdAtSignup` is the
// LINK, not a replacement — telemetry keeps flowing under the anon id and
// this row records which account it belonged to (Phase 1 identity model:
// anonymous-default / account-optional; linked, not replaced, on signup).
//
// Scope: this is the ONLY table in PR1. No run-save / ghost / leaderboard
// columns yet — those land in later M2 PRs (roadmap.md M2 kill list keeps
// this PR to server scaffolding).

import {
  date,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const accounts = pgTable('accounts', {
  /** Server-owned account id (uuid v4, DB-generated). */
  id: uuid('id').primaryKey().defaultRandom(),
  /** Clerk user id (JwtPayload.sub). One account per Clerk user. */
  clerkUserId: text('clerk_user_id').notNull().unique(),
  /** telemetryAnonId captured at signup — links the pre-account device
   *  identity. Nullable: a signup may lack a prior anon session. */
  anonIdAtSignup: text('anon_id_at_signup'),
  /** Row creation time (server clock, timezone-aware). */
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

// Meta-progression save — one row per account (M2.1 PR3).
//
// Scope note (Option A, plumbing-only per decision-log.md 2026-07-14
// § "M2.1 PR3 PHASE 1 RATIFIED"): PR3 lands the pipe, not the taps. No
// producers are wired, so every field syncs its stubbed value (0 / null)
// until a later PR wires the real sources. That is deliberate.
//
// `inProgressRun` is NOT here: it stays device-local by ratification, which
// is why § 6.2's original `/v1/run/save` name was renamed `/v1/player/save`
// — nothing "run"-shaped is stored server-side.
//
// No `schemaVersion` column: the table is drizzle-migrated and the DTO is
// route-versioned. LocalSaveV1's schemaVersion stays a client-envelope
// concern.
export const playerSaves = pgTable('player_saves', {
  /** PK **is** the FK — that IS the 1:1 constraint (no surrogate id, no
   *  separate UNIQUE). Cascade: deleting the account deletes its save. */
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  /** SIGNED, and deliberately CHECK-free. gdd.md § 13 ("Lose → -trophies")
   *  makes trophies non-monotonic, so a non-negative CHECK would be wrong
   *  and `max()`-style merges are ruled out. The loss-penalty schedule and
   *  floor-at-zero question are CF-72, still open — hence no constraint. */
  trophies: integer('trophies').notNull().default(0),
  /** NEVER client-settable — always server-derived (see routes/playerSave.ts
   *  deriveDailyStreak). Present in the row, absent from the PUT body. */
  dailyStreak: integer('daily_streak').notNull().default(0),
  /** pg `date`, mode:'string' — matches `IsoDate = Brand<string,'IsoDate'>`
   *  (packages/content/src/schemas.ts). NOT a timestamp: a JS Date would
   *  break the brand and reintroduce the TZ bugs the brand exists to stop.
   *  Nullable — a player may never have attempted a daily. */
  lastDailyAttempted: date('last_daily_attempted', { mode: 'string' }),
  /** Last write time (server clock, timezone-aware). */
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
