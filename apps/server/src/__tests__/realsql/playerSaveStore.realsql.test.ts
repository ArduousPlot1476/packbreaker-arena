// player_saves against REAL Postgres (M2.1 PR3).
//
// The ratified requirement: "PR3 MUST include a real-Postgres test for
// player_saves … a fake-store-only plan is REJECTED" (decision-log.md
// 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED"). This is that test.
//
// NOTE ON ATTRIBUTION: this file does NOT close CF-74. CF-74 is the
// composer hardcoded-zero bug in the CLIENT (useRun.ts) — no SQL test can
// close it; its closure is the H4 fix + its regression test in
// RunContext.test.tsx. This file is its own ratified DoD item.
//
// Every test drives createPlayerSaveStore — the same function index.ts
// wires in production — never a fake.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAccountStore } from '../../db/accountStore.js'
import {
  createPlayerSaveStore,
  type PlayerSaveStore,
} from '../../db/playerSaveStore.js'
import { REAL_SQL_AVAILABLE, setupRealDb, type RealDb } from './harness.js'

describe.skipIf(!REAL_SQL_AVAILABLE)('PlayerSaveStore — real SQL (M2.1 PR3)', () => {
  let real: RealDb
  let store: PlayerSaveStore
  let accountId: string

  beforeAll(async () => {
    real = await setupRealDb()
    store = createPlayerSaveStore(real.db)
    const accounts = createAccountStore(real.db)
    const account = await accounts.createIfAbsent({
      clerkUserId: 'user_ps_owner',
      anonIdAtSignup: 'anon-ps',
    })
    accountId = account!.id
  })
  afterAll(async () => {
    await real?.close()
  })

  it('findByAccountId returns null before any write', async () => {
    expect(await store.findByAccountId(accountId)).toBeNull()
  })

  it('upsert inserts, then UPDATES on conflict rather than throwing on the PK', async () => {
    const first = await store.upsert({
      accountId,
      trophies: 10,
      dailyStreak: 1,
      lastDailyAttempted: '2026-07-14',
    })
    expect(first.trophies).toBe(10)

    // Same PK again — ON CONFLICT (account_id) DO UPDATE. A plain insert
    // would raise a duplicate-key error here; that is the whole point.
    const second = await store.upsert({
      accountId,
      trophies: 25,
      dailyStreak: 2,
      lastDailyAttempted: '2026-07-15',
    })
    expect(second.trophies).toBe(25)
    expect(second.dailyStreak).toBe(2)
    expect(second.lastDailyAttempted).toBe('2026-07-15')

    // Still exactly ONE row — an upsert, not a second insert.
    const found = await store.findByAccountId(accountId)
    expect(found!.trophies).toBe(25)
  })

  it('concurrent first-write upserts do not 500 on the primary key', async () => {
    const accounts = createAccountStore(real.db)
    const acc = await accounts.createIfAbsent({
      clerkUserId: 'user_ps_race',
      anonIdAtSignup: 'anon-race',
    })
    // Both callers see "no row" and both write — the R2 race, in real SQL.
    const [a, b] = await Promise.all([
      store.upsert({ accountId: acc!.id, trophies: 1, dailyStreak: 1, lastDailyAttempted: null }),
      store.upsert({ accountId: acc!.id, trophies: 2, dailyStreak: 1, lastDailyAttempted: null }),
    ])
    expect([a.trophies, b.trophies].sort()).toEqual([1, 2])
    // One row survives; last write wins.
    const found = await store.findByAccountId(acc!.id)
    expect([1, 2]).toContain(found!.trophies)
  })

  // The FK is the 1:1 constraint (PK **is** the FK). A save for a
  // non-existent account must be rejected BY POSTGRES, not by app code.
  it('rejects a save whose account_id has no accounts row (FK violation)', async () => {
    await expect(
      store.upsert({
        accountId: '00000000-0000-4000-8000-000000000000',
        trophies: 0,
        dailyStreak: 0,
        lastDailyAttempted: null,
      }),
    ).rejects.toThrow()
  })

  // trophies is SIGNED with NO CHECK — gdd.md § 13 "Lose → -trophies"
  // makes it non-monotonic. If someone later "helpfully" adds a
  // non-negative CHECK, this test fails and says why.
  it('accepts NEGATIVE trophies — the column is deliberately CHECK-free', async () => {
    const saved = await store.upsert({
      accountId,
      trophies: -7,
      dailyStreak: 0,
      lastDailyAttempted: null,
    })
    expect(saved.trophies).toBe(-7)
  })

  // last_daily_attempted is pg `date` mode:'string' — it must round-trip as
  // a plain YYYY-MM-DD string, NOT a JS Date (which would break the IsoDate
  // brand and reintroduce the TZ bugs the brand exists to prevent).
  it('lastDailyAttempted round-trips as a YYYY-MM-DD string, not a Date', async () => {
    const saved = await store.upsert({
      accountId,
      trophies: 0,
      dailyStreak: 3,
      lastDailyAttempted: '2026-01-02',
    })
    expect(saved.lastDailyAttempted).toBe('2026-01-02')
    expect(typeof saved.lastDailyAttempted).toBe('string')
    const found = await store.findByAccountId(accountId)
    expect(found!.lastDailyAttempted).toBe('2026-01-02')
    expect(typeof found!.lastDailyAttempted).toBe('string')
  })

  // Catch 59. playerSaveStore's upsert sets `updatedAt: sql`now()`` in its DO
  // UPDATE branch, with a comment claiming "a write always advances updatedAt
  // even when every other column is byte-identical". Nothing tested that.
  //
  // The claim is NOT self-evident, and that is the point: `updated_at`'s
  // DEFAULT now() fires on INSERT ONLY. Drop the explicit set from the DO
  // UPDATE branch and updated_at silently FREEZES at insert time — every other
  // test in this repo still passes, because none of them read it. That is
  // Catch 58's anatomy exactly (an untested belief about a real system's
  // behaviour at a DB boundary), sitting inside the PR that exists to close
  // that class.
  //
  // The byte-identical payload is load-bearing: a write that changes a column
  // could plausibly advance updated_at by some other mechanism, so a no-op
  // write is the only case that isolates the explicit `now()`.
  it('upsert advances updated_at even when every other column is byte-identical', async () => {
    const accounts = createAccountStore(real.db)
    const acc = await accounts.createIfAbsent({
      clerkUserId: 'user_ps_updated_at',
      anonIdAtSignup: 'anon-updated-at',
    })
    const payload = {
      accountId: acc!.id,
      trophies: 11,
      dailyStreak: 2,
      lastDailyAttempted: '2026-07-15',
    }

    const first = await store.upsert(payload)

    // CLOCK GUARD (Codex round 4, P2). Postgres stores timestamptz at
    // MICROsecond precision, but node-postgres hands it back as a JS `Date`,
    // which is MILLIsecond-resolution — so a real advance of, say, 300µs
    // collapses to the same `getTime()` and the strict assertion below flakes
    // even though `now()` fired correctly.
    //
    // Not hypothetical, and note WHY it never flaked locally: this suite runs
    // against remote Neon, whose 40–55ms round-trips mask the collision by
    // accident. CI runs a LOCALHOST service container with sub-millisecond
    // round-trips, where two consecutive upserts land in the same millisecond
    // routinely. The local pass was an artifact of network latency, not a
    // property of the code.
    //
    // The fix is a guard, NOT a weaker assertion. Relaxing to `>=` would make
    // this test pass when updated_at fails to advance at all — i.e. it would
    // pass in exactly the scenario it exists to catch (Catch 59), which is
    // worse than deleting it. 10ms comfortably clears the 1ms boundary on any
    // machine while costing one tick.
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Re-write the SAME values — a semantic no-op. Only the explicit
    // `now()` in the DO UPDATE branch can move updated_at here.
    const second = await store.upsert(payload)

    expect(second.trophies).toBe(first.trophies)
    expect(second.dailyStreak).toBe(first.dailyStreak)
    expect(second.lastDailyAttempted).toBe(first.lastDailyAttempted)
    // The assertion the claim was missing.
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime())

    // And it is persisted, not merely returned by RETURNING.
    const reread = await store.findByAccountId(acc!.id)
    expect(reread!.updatedAt.getTime()).toBe(second.updatedAt.getTime())
  })

  it('ON DELETE CASCADE removes the save when its account is deleted', async () => {
    const accounts = createAccountStore(real.db)
    const acc = await accounts.createIfAbsent({
      clerkUserId: 'user_ps_cascade',
      anonIdAtSignup: 'anon-cascade',
    })
    await store.upsert({
      accountId: acc!.id,
      trophies: 99,
      dailyStreak: 0,
      lastDailyAttempted: null,
    })
    expect(await store.findByAccountId(acc!.id)).not.toBeNull()

    await real.pool.query('DELETE FROM accounts WHERE id = $1', [acc!.id])
    expect(await store.findByAccountId(acc!.id)).toBeNull()
  })
})
