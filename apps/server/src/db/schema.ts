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
  primaryKey,
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

// Meta-progression save — one row per account (M2.1 PR3; trophy write-path
// reworked in CF-77 Phase 2 PR1).
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
   *  and `max()`-style merges are ruled out. Server-owned as of CF-77 Phase 2:
   *  never client-set — the write path applies a per-round delta from
   *  `trophyDeltaFor` (see db/playerSaveStore.ts applyRoundResult). */
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

// CF-77 Phase 2 write-versioning — idempotency record (Codex round 1 P1 fix).
//
// One row per (account, run, round) that has ALREADY been applied to
// player_saves.trophies. This SUPERSEDES the last_run_id/last_round_applied
// tracker from the first cut of 0002: a per-account "last applied" pair could
// not distinguish a genuinely-new run from a stale retry of an OLDER, already-
// superseded run (apply run-A r1 → run-B r1 → a delayed run-A r1 retry looked
// "unseen" and re-credited). A composite-PK idempotency record rejects that
// directly — the retry's tuple already exists, so its INSERT no-ops. The old
// tracker's only real protection was within-run sequencing (its "unseen run"
// branch accepted ANY round as a fresh run's first submission — it never
// enforced global ordering), so this is a strict replacement, not an addition.
// See decision-log.md 2026-07-17 § "CF-77 Phase 1 RATIFIED" (b36d3cc) for the
// superseded design.
//
// GROWTH — KNOWN, NON-BLOCKING future concern (not solved here): this table
// grows one row per applied round forever. A retention/pruning policy (e.g.
// drop rows for ended runs, or older than N days) is a follow-up, not part of
// this PR. Flagged so a future reader plans for it rather than discovering it.
export const appliedRoundResults = pgTable(
  'applied_round_results',
  {
    /** FK → accounts; cascade so an account delete cleans up its records
     *  (mirrors player_saves). Part of the composite PK. */
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** Opaque per-run id (PR2 mints a uuid v4) — never parsed. */
    runId: text('run_id').notNull(),
    round: integer('round').notNull(),
    /** When this round was first applied (server clock). Observability only —
     *  the PK is what enforces idempotency. */
    appliedAt: timestamp('applied_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    /** The idempotency key: a second write of the same (account, run, round)
     *  conflicts on this PK, so its INSERT ... ON CONFLICT DO NOTHING returns
     *  no row and the trophy delta is not re-applied. */
    pk: primaryKey({ columns: [t.accountId, t.runId, t.round] }),
  }),
)
