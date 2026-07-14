// Account store — DI seam over the accounts table (M2.1 PR2.5).
//
// Mirrors the CF-49 posthog-sink pattern: `AccountStore` is the narrow
// interface the route depends on, NOT drizzle's full surface. The real
// implementation (createAccountStore) runs queries against the pg-backed
// drizzle handle; tests inject an in-memory fake, so the route's three
// idempotency paths are unit-tested with NO live credentials (the real
// SQL is the deferred live-verify surface, like db/client.ts healthCheck).

import { and, eq, isNull } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

/** The subset of an account row the link route reads/writes. */
export interface AccountRecord {
  readonly id: string
  readonly clerkUserId: string
  readonly anonIdAtSignup: string | null
}

/** Narrow account persistence surface the link route depends on. */
export interface AccountStore {
  findByClerkUserId(clerkUserId: string): Promise<AccountRecord | null>
  /** Atomically inserts the account, or does NOTHING if a row for this
   *  clerkUserId already exists (`ON CONFLICT (clerk_user_id) DO NOTHING`).
   *  Returns the created record, or null when a concurrent/prior call
   *  already created it — so a concurrent first-sign-in can't 500 on the
   *  unique constraint; the caller re-reads + link-if-nulls instead. */
  createIfAbsent(input: {
    clerkUserId: string
    anonIdAtSignup: string
  }): Promise<AccountRecord | null>
  /** Atomically sets anon_id_at_signup ONLY if it is currently null
   *  (`WHERE id = ? AND anon_id_at_signup IS NULL`). Returns true iff THIS
   *  call performed the link — so two concurrent link requests that both
   *  observed null can't overwrite each other (the never-overwrite contract
   *  holds at the SQL layer, not just via the handler's read-then-check). */
  linkAnonIdIfNull(accountId: string, anonId: string): Promise<boolean>
}

/** Builds the real store over a drizzle handle (accounts schema). */
export function createAccountStore(
  db: NodePgDatabase<typeof schema>,
): AccountStore {
  return {
    async findByClerkUserId(clerkUserId) {
      const rows = await db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.clerkUserId, clerkUserId))
        .limit(1)
      const row = rows[0]
      if (row === undefined) return null
      return {
        id: row.id,
        clerkUserId: row.clerkUserId,
        anonIdAtSignup: row.anonIdAtSignup,
      }
    },
    async createIfAbsent(input) {
      const rows = await db
        .insert(schema.accounts)
        .values({
          clerkUserId: input.clerkUserId,
          anonIdAtSignup: input.anonIdAtSignup,
        })
        .onConflictDoNothing({ target: schema.accounts.clerkUserId })
        .returning()
      const row = rows[0]
      if (row === undefined) return null // conflict — a row already existed
      return {
        id: row.id,
        clerkUserId: row.clerkUserId,
        anonIdAtSignup: row.anonIdAtSignup,
      }
    },
    async linkAnonIdIfNull(accountId, anonId) {
      const rows = await db
        .update(schema.accounts)
        .set({ anonIdAtSignup: anonId })
        .where(
          and(
            eq(schema.accounts.id, accountId),
            isNull(schema.accounts.anonIdAtSignup),
          ),
        )
        .returning({ id: schema.accounts.id })
      return rows.length > 0
    },
  }
}
