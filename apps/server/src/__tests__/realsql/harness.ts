// Real-Postgres test harness (M2.1 PR3).
//
// WHY THIS EXISTS — CF-73 / Catch 58 / Rule 4 (broadened). PR2's
// createAccountStore shipped with ZERO tests against its real SQL: the
// route test injected a fake that HAND-MIRRORED the author's belief about
// `ON CONFLICT … DO NOTHING`, so the belief was unfalsifiable. That is
// CF-70's anatomy one layer over (verifier.ts believed verifyToken
// returned `{data, errors}`; 6 Codex rounds and 91 tests missed it because
// every test at that boundary mocked the verifier). Rule 4, as broadened
// at decision-log.md 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED": "at least
// one test per external-SYSTEM boundary must exercise the REAL system's
// behaviour, not an assumed one" — databases included.
//
// HARNESS CHOICE: GitHub Actions Postgres SERVICE CONTAINER, not
// testcontainers. Phase 1 deferred this to Phase 2; the deciding facts:
//   - testcontainers needs a Docker daemon. There is none on the dev box
//     (`docker: command not found`), so it would be unrunnable AND
//     unverifiable locally — a harness nobody can execute before pushing.
//   - A service container needs no Docker in test code, and CI injects a
//     NON-SECRET localhost URL. So the suite ALWAYS runs in CI, which is
//     exactly the protection Phase 1 demanded when it rejected a
//     `skipIf(!DATABASE_URL)` local-only plan ("CI ships no secrets … would
//     give zero CI protection — the posture that let this gap persist").
//   - The same file runs locally against any real Postgres (e.g. Neon) by
//     setting TEST_DATABASE_URL, so it is verifiable before push.
//
// SKIP SEMANTICS — deliberately asymmetric. Locally, an unset
// TEST_DATABASE_URL skips (a dev without a database is not a failure). In
// CI it THROWS: the service container guarantees the var, so an unset var
// there means the harness broke, and silently skipping would recreate the
// exact zero-coverage posture CF-73 exists to close.
//
// TURBO ENV PASSTHROUGH — load-bearing, see turbo.json's `test.env`.
// Turborepo filters the task environment: a var set on a CI *step* does NOT
// reach vitest unless declared. Round 1 proved it — TEST_DATABASE_URL was set
// on the workflow step, never arrived, and this guard failed the build rather
// than skipping. Two notes on that declaration:
//   - `env` (hashed), NOT `passThroughEnv` (unhashed), because the DB URL must
//     be part of the cache key. Otherwise a cached run from a machine with no
//     database (suite skipped) could satisfy a CI run required to execute it —
//     silently restoring the very posture CF-73 closes.
//   - CI is declared even though it already reaches the task (round 1's THROW
//     is only reachable when CI==='true'). It arrives via Turborepo's implicit
//     system-var allowlist, not a declared path, and the throw-vs-skip branch
//     below depends on it. If that implicit behaviour changed, this guard would
//     silently downgrade from throw to skip. Declaring it makes the
//     precondition explicit rather than assumed — which is CF-73's whole
//     lesson: coverage must not rest on an unfalsifiable assumption.
//
// ISOLATION: every run gets a throwaway schema and drops it afterwards, so
// a real DATABASE_URL (Neon) can be targeted without touching live rows.
// Migration SQL is applied with its `"public".` qualifier stripped so the
// FK resolves inside the throwaway schema via search_path — drizzle-kit
// hardcodes `REFERENCES "public"."accounts"` in 0001.

import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { sql } from 'drizzle-orm'
import pg from 'pg'
import * as schema from '../../db/schema.js'

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'drizzle',
)

/** Neon's `-pooler` host is transaction-mode pooled: consecutive queries may
 *  land on different backends, so a session-scoped `SET search_path` does not
 *  stick and the libpq `options` startup parameter is not honoured. Tests
 *  need a real session, so route them at the DIRECT endpoint. A no-op for a
 *  plain Postgres (CI's service container has no `-pooler` in its host). */
function directUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hostname = parsed.hostname.replace('-pooler.', '.')
    return parsed.toString()
  } catch {
    return url
  }
}

function realDbUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL
  if (url !== undefined && url !== '') return url
  if (process.env.CI === 'true') {
    throw new Error(
      'TEST_DATABASE_URL is unset in CI. The real-SQL suite is NOT skippable ' +
        'there — the Postgres service container must provide it (CF-73 / Rule 4). ' +
        'Skipping in CI would restore the zero-coverage posture this suite closes.',
    )
  }
  return null
}

/** True iff a real Postgres is reachable. Call sites gate with
 *  `describe.skipIf(!REAL_SQL_AVAILABLE)`.
 *
 *  A boolean rather than a pre-bound `describe` on purpose: exporting a
 *  `describe`/`describe.skip` union re-exports vitest-internal types that tsc
 *  cannot name from here (TS2742/TS4023 — `SuiteCollectorCallable`), and
 *  annotating it `typeof describe` fails too (TS2322: `ChainableFunction` is
 *  not a `SuiteAPI`). A boolean has no such problem.
 *
 *  Evaluating this at module load is what enforces the CI guarantee:
 *  realDbUrl() THROWS when CI=true and the var is unset, so a broken service
 *  container fails the run instead of silently skipping. */
export const REAL_SQL_AVAILABLE: boolean = realDbUrl() !== null

export interface RealDb {
  readonly db: NodePgDatabase<typeof schema>
  readonly pool: pg.Pool
  /** Drops the throwaway schema and closes the pool. */
  close(): Promise<void>
}

/** Migration SQL in journal order, `"public".`-stripped so unqualified
 *  names resolve to the throwaway schema through search_path. */
function migrationStatements(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  return files.flatMap((f) =>
    readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
      .replaceAll('"public".', '')
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  )
}

/** Connects, creates an isolated schema, applies every migration into it,
 *  and returns a drizzle handle bound to it. */
export async function setupRealDb(): Promise<RealDb> {
  const connectionString = realDbUrl()
  if (connectionString === null) {
    throw new Error('setupRealDb called without TEST_DATABASE_URL')
  }
  // Unique per run — parallel workers and repeat runs must not collide.
  const schemaName = `pba_test_${Date.now().toString(36)}_${Math.floor(
    Math.random() * 1e6,
  ).toString(36)}`

  // The schema itself is created over a plain connection (CREATE SCHEMA is
  // not search_path-dependent), then thrown away.
  const admin = new pg.Pool({ connectionString: directUrl(connectionString) })
  await admin.query(`CREATE SCHEMA "${schemaName}"`)
  await admin.end()

  // search_path is pinned as a libpq STARTUP PARAMETER, not a session `SET`.
  // This is load-bearing: a session `SET` is unreliable under transaction-mode
  // connection pooling (Neon's `-pooler` endpoint, PgBouncer), where
  // consecutive queries can land on different backends — so some writes went
  // to `public` and others to the test schema, and the FK then failed with
  // "Key (account_id)=… is not present in table accounts". A startup
  // parameter is applied per-connection at connect time, so every backend
  // this pool hands out is already pinned. `directUrl` additionally bypasses
  // the pooler, which is what makes the parameter stick at all.
  const pool = new pg.Pool({
    connectionString: directUrl(connectionString),
    options: `-c search_path="${schemaName}"`,
  })
  for (const statement of migrationStatements()) {
    await pool.query(statement)
  }

  const db = drizzle(pool, { schema })
  // Guard: a silently-empty migration set would make every assertion below
  // vacuous (the CF-73 failure mode — coverage that cannot fail).
  const check = await db.execute(
    sql`select count(*)::int as n from information_schema.tables where table_schema = ${schemaName}`,
  )
  const tableCount = (check.rows[0] as { n: number }).n
  if (tableCount < 2) {
    await pool.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
    await pool.end()
    throw new Error(
      `real-SQL harness applied migrations but found ${tableCount} tables (expected >= 2: accounts, player_saves)`,
    )
  }

  return {
    db,
    pool,
    async close() {
      await pool.end()
      // Dropped over a fresh connection: the pool's own connections are
      // pinned INSIDE this schema, and dropping the schema out from under
      // them is what leaves orphaned sessions.
      const cleanup = new pg.Pool({ connectionString: directUrl(connectionString) })
      await cleanup.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      await cleanup.end()
    },
  }
}
