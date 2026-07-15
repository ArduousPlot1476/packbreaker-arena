// CF-73 — AccountStore against REAL Postgres (M2.1 PR3).
//
// Closes the Catch 58 gap INSIDE PR3, without reopening PR2. PR2's
// createAccountStore — the REAL drizzle SQL — was referenced in ZERO
// tests; account.route.test.ts injects a fake whose own comment says it
// "Mirror[s] ON CONFLICT (clerk_user_id) DO NOTHING: the has+set is one
// synchronous step". That is an assertion about the AUTHOR'S BELIEF, not
// about Postgres. This file asserts against Postgres.
//
// Every test below drives createAccountStore — the same function index.ts
// wires in production — never a fake.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAccountStore, type AccountStore } from '../../db/accountStore.js'
import { REAL_SQL_AVAILABLE, setupRealDb, type RealDb } from './harness.js'

describe.skipIf(!REAL_SQL_AVAILABLE)('AccountStore — real SQL (CF-73 / Catch 58)', () => {
  let real: RealDb
  let store: AccountStore

  beforeAll(async () => {
    real = await setupRealDb()
    store = createAccountStore(real.db)
  })
  afterAll(async () => {
    await real?.close()
  })

  it('createIfAbsent inserts a new account and returns the row', async () => {
    const created = await store.createIfAbsent({
      clerkUserId: 'user_realsql_1',
      anonIdAtSignup: 'anon-1',
    })
    expect(created).not.toBeNull()
    expect(created!.clerkUserId).toBe('user_realsql_1')
    expect(created!.anonIdAtSignup).toBe('anon-1')
    // DB-generated uuid — proves the default fired, not a client value.
    expect(created!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  // THE CF-73 ASSERTION. The fake asserts the author's belief; this asserts
  // Postgres. A second insert for the same clerk_user_id must return NO row
  // (DO NOTHING), NOT throw a unique-violation — that is precisely what lets
  // routes/account.ts survive a concurrent first sign-in without a 500.
  it('createIfAbsent on a duplicate clerkUserId returns null — does NOT throw', async () => {
    await store.createIfAbsent({
      clerkUserId: 'user_realsql_dup',
      anonIdAtSignup: 'anon-first',
    })
    const second = await store.createIfAbsent({
      clerkUserId: 'user_realsql_dup',
      anonIdAtSignup: 'anon-second',
    })
    expect(second).toBeNull()

    // And the conflict left the ORIGINAL row untouched — DO NOTHING must
    // not overwrite anon_id_at_signup (the never-overwrite contract).
    const existing = await store.findByClerkUserId('user_realsql_dup')
    expect(existing!.anonIdAtSignup).toBe('anon-first')
  })

  it('concurrent createIfAbsent for the same user: exactly one insert wins, neither throws', async () => {
    // The real race PR2's round-2 fix targets. Under a unique constraint
    // WITHOUT ON CONFLICT this rejects one caller; with DO NOTHING the
    // loser gets null.
    const [a, b] = await Promise.all([
      store.createIfAbsent({ clerkUserId: 'user_realsql_race', anonIdAtSignup: 'anon-a' }),
      store.createIfAbsent({ clerkUserId: 'user_realsql_race', anonIdAtSignup: 'anon-b' }),
    ])
    const winners = [a, b].filter((r) => r !== null)
    expect(winners).toHaveLength(1)
  })

  it('linkAnonIdIfNull sets the id only when currently null, and never overwrites', async () => {
    const created = await store.createIfAbsent({
      clerkUserId: 'user_realsql_link',
      anonIdAtSignup: null as unknown as string,
    })
    // Row exists with a null anon id → first link wins.
    const first = await store.linkAnonIdIfNull(created!.id, 'anon-linked')
    expect(first).toBe(true)
    // Second link must be a no-op — the WHERE … IS NULL guard, in real SQL.
    const second = await store.linkAnonIdIfNull(created!.id, 'anon-overwrite')
    expect(second).toBe(false)
    const after = await store.findByClerkUserId('user_realsql_link')
    expect(after!.anonIdAtSignup).toBe('anon-linked')
  })

  it('findByClerkUserId returns null for an unknown user', async () => {
    expect(await store.findByClerkUserId('user_realsql_absent')).toBeNull()
  })
})
