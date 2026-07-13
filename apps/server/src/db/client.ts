// Postgres (Neon) connection + DI seam (M2 PR1).
//
// Mirrors posthog/client.ts: `DbClient` is the narrow interface the app
// depends on — NOT the full drizzle/pg surface. createDbClient returns
// `null` (and warns) when DATABASE_URL is unset, so the server boots
// without a database (DB-backed features degrade rather than crash) —
// the same accept-and-degrade posture as the telemetry sink's env-unset
// path, and the reason CI (which ships no secrets) stays green.
//
// Driver: node-postgres (pg) Pool against Neon's pooled connection
// string, wrapped by drizzle-orm/node-postgres (Phase 1 decision). The
// pool is LAZY — no socket opens until the first query — so construction
// never throws on an unreachable/absent database. healthCheck() runs the
// first real query (SELECT 1); it is the live-verification seam that
// Phase 1 deferred ("build offline") until a DATABASE_URL is provisioned.

import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import type { WarnLogger } from '../logging.js'
import * as schema from './schema.js'

/** The subset of the database the app depends on. Narrow by design: PR1
 *  only needs a liveness check + graceful teardown, plus the drizzle
 *  handle for the query sites that land in later M2 PRs. */
export interface DbClient {
  /** Drizzle handle over the pool (typed against the accounts schema). */
  readonly db: NodePgDatabase<typeof schema>
  /** Runs SELECT 1. Resolves true on success; rejects on failure. This
   *  is the first call that actually opens a connection. */
  healthCheck(): Promise<boolean>
  /** Drains the pool before process exit (app.ts onClose hook). */
  close(): Promise<void>
}

/** Builds the DB client from resolved env. Returns `null` (and warns)
 *  when no connection string is configured. Never throws on construction
 *  — the pg Pool connects lazily on first query. */
export function createDbClient(
  opts: { databaseUrl: string | null },
  log: WarnLogger,
): DbClient | null {
  if (opts.databaseUrl === null) {
    log.warn(
      'DATABASE_URL unset — the server will boot without a database; DB-backed features are unavailable',
    )
    return null
  }
  const pool = new pg.Pool({ connectionString: opts.databaseUrl })
  const db = drizzle(pool, { schema })
  return {
    db,
    async healthCheck() {
      await pool.query('SELECT 1')
      return true
    },
    async close() {
      await pool.end()
    },
  }
}
