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

import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

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
