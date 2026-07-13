// DB client seam — createDbClient real-or-null (M2 PR1).
//
// Offline: the null-URL path is the primary assertion. The set-URL path
// asserts the client shape only — the pg Pool is lazy (no socket until
// the first query), so construction + close touch no network. The live
// healthCheck() SELECT 1 is the Phase-1-deferred verification, exercised
// once a DATABASE_URL is provisioned.

import { describe, expect, it } from 'vitest'
import { createDbClient } from '../db/client.js'

describe('createDbClient', () => {
  it('unset DATABASE_URL → null client + one warn', () => {
    const warns: string[] = []
    const db = createDbClient(
      { databaseUrl: null },
      { warn: (m) => warns.push(m) },
    )
    expect(db).toBeNull()
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('DATABASE_URL')
  })

  it('set DATABASE_URL → non-null client (lazy pool, no connection)', async () => {
    const warns: string[] = []
    const db = createDbClient(
      { databaseUrl: 'postgresql://user:pass@localhost:5432/db' },
      { warn: (m) => warns.push(m) },
    )
    expect(db).not.toBeNull()
    expect(typeof db!.healthCheck).toBe('function')
    expect(typeof db!.close).toBe('function')
    expect(warns).toHaveLength(0)
    // Lazy pool: closing without a query opens (and drains) no socket.
    await db!.close()
  })
})
