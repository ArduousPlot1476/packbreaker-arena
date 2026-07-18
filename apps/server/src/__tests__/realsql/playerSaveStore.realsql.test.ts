// player_saves against REAL Postgres (M2.1 PR3; CF-77 Phase 2 PR1 trophy path,
// idempotency-record fix from Codex round 1).
//
// The ratified requirement: "PR3 MUST include a real-Postgres test for
// player_saves … a fake-store-only plan is REJECTED" (decision-log.md
// 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED"). CF-77 keeps that bar: the
// idempotency gate (the applied_round_results composite-PK ON CONFLICT) + the
// loss-floor lock (SELECT … FOR UPDATE serialization) are SQL/transaction
// semantics, so they are asserted HERE against real Postgres, never a fake.
//
// The CF-77 scenarios (decision-log.md 2026-07-17 § "CF-77 Phase 2 PR1"):
//   a. sequential same-run apply — deltas accumulate
//   b. same-round duplicate resend → trophy no-op (PK conflict)
//   c. skip-ahead round → APPLIES (semantics change vs the superseded tracker —
//      idempotency enforces no ordering; see the test)
//   d. unseen runId → applies (new tuple)
//   e. concurrent identical run+round → exactly one applies (PK conflict blocks
//      the double)
//   f. concurrent DIFFERENT-run losses near the floor → never net below zero
//      (the loss-floor lock; a naive read-then-write nets −5)
//   g. STALE retry of a superseded run → no-op (the Codex round 1 P1 fix — the
//      old last_run_id tracker re-credited this; the idempotency record rejects it)
//
// Expected trophy values are computed via `trophyDeltaFor` (imported), NOT
// hand-literals — this asserts "the store threads the SCHEDULE correctly" without
// pinning numbers that would co-drift. trophyDeltaFor's arithmetic is covered by
// packages/sim. Every test drives createPlayerSaveStore — never a fake.

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { trophyDeltaFor } from '@packbreaker/sim'
import { createAccountStore, type AccountStore } from '../../db/accountStore.js'
import {
  createPlayerSaveStore,
  type PlayerSaveStore,
} from '../../db/playerSaveStore.js'
import { REAL_SQL_AVAILABLE, setupRealDb, type RealDb } from './harness.js'

describe.skipIf(!REAL_SQL_AVAILABLE)('PlayerSaveStore — real SQL (CF-77 Phase 2)', () => {
  let real: RealDb
  let store: PlayerSaveStore
  let accounts: AccountStore
  // Deterministic per-test account ids — each scenario gets a fresh account so
  // trophy totals + applied-round records never bleed between tests.
  let acctSeq = 0

  beforeAll(async () => {
    real = await setupRealDb()
    store = createPlayerSaveStore(real.db)
    accounts = createAccountStore(real.db)
  })
  afterAll(async () => {
    await real?.close()
  })

  async function freshAccountId(): Promise<string> {
    acctSeq += 1
    const acc = await accounts.createIfAbsent({
      clerkUserId: `user_cf77_${acctSeq}`,
      anonIdAtSignup: `anon_cf77_${acctSeq}`,
    })
    return acc!.id
  }

  /** A round report with the daily fields fixed (orthogonal to the trophy
   *  path — every trophy scenario holds them constant). */
  function round(
    accountId: string,
    runId: string,
    r: number,
    roundOutcome: 'win' | 'loss',
  ) {
    return store.applyRoundResult({
      accountId,
      runId,
      round: r,
      roundOutcome,
      dailyStreak: 0,
      lastDailyAttempted: null,
    })
  }

  // ── Structural ──

  it('findByAccountId returns null before any write', async () => {
    expect(await store.findByAccountId(await freshAccountId())).toBeNull()
  })

  // The FK on applied_round_results.account_id (and player_saves) must reject a
  // round for a non-existent account BY POSTGRES, not app code. The very first
  // statement (the idempotency insert) trips it.
  it('rejects a round whose account_id has no accounts row (FK violation)', async () => {
    await expect(
      round('00000000-0000-4000-8000-000000000000', 'run-x', 1, 'win'),
    ).rejects.toThrow()
  })

  // last_daily_attempted is pg `date` mode:'string' — round-trips as a plain
  // YYYY-MM-DD string, NOT a JS Date (which would break the IsoDate brand).
  it('lastDailyAttempted round-trips as a YYYY-MM-DD string, not a Date', async () => {
    const acct = await freshAccountId()
    const saved = await store.applyRoundResult({
      accountId: acct,
      runId: 'run-date',
      round: 1,
      roundOutcome: 'win',
      dailyStreak: 3,
      lastDailyAttempted: '2026-01-02',
    })
    expect(saved.lastDailyAttempted).toBe('2026-01-02')
    expect(typeof saved.lastDailyAttempted).toBe('string')
    const found = await store.findByAccountId(acct)
    expect(found!.lastDailyAttempted).toBe('2026-01-02')
    expect(typeof found!.lastDailyAttempted).toBe('string')
  })

  // Catch 59, carried forward under the new semantics. applyRoundResult sets
  // `updatedAt: sql`now()`` in the apply UPDATE; drop it and updated_at silently
  // FREEZES at the ensure-insert default — every other test still passes because
  // none read it (Catch 58's anatomy). The isolating case is a DISTINCT applied
  // round: a duplicate is now a true no-op that never touches the row, so the
  // apply path is what carries the explicit now(). If it were removed, the second
  // apply's UPDATE would not advance updated_at past the first.
  it('updated_at advances on each applied (distinct) round', async () => {
    const acct = await freshAccountId()
    const first = await round(acct, 'run-uat', 1, 'win')

    // CLOCK GUARD (Catch 59, Codex round 4 P2). Postgres timestamptz is µs;
    // node-postgres hands back a ms-resolution JS Date, so a sub-ms advance
    // collapses to the same getTime() and the strict assertion flakes. Local
    // Neon's 40–55ms round-trips masked this; CI's localhost container lands two
    // writes in the same ms routinely. 10ms clears the 1ms boundary. Relaxing to
    // >= would pass in the exact scenario this catches.
    await new Promise((resolve) => setTimeout(resolve, 10))

    const second = await round(acct, 'run-uat', 2, 'win') // distinct round → applies
    expect(second.trophies).toBeGreaterThan(first.trophies) // it really applied
    expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime())
    const reread = await store.findByAccountId(acct)
    expect(reread!.updatedAt.getTime()).toBe(second.updatedAt.getTime())
  })

  it('ON DELETE CASCADE removes the save when its account is deleted', async () => {
    const acct = await freshAccountId()
    await round(acct, 'run-cascade', 1, 'win')
    expect(await store.findByAccountId(acct)).not.toBeNull()
    await real.pool.query('DELETE FROM accounts WHERE id = $1', [acct])
    expect(await store.findByAccountId(acct)).toBeNull()
  })

  // ── The CF-77 scenarios ──

  it('a. sequential same-run apply — deltas accumulate in order', async () => {
    const acct = await freshAccountId()
    const run = 'run-seq'
    await round(acct, run, 1, 'win')
    await round(acct, run, 2, 'win')
    const after = await round(acct, run, 3, 'loss')

    const t1 = 0 + trophyDeltaFor('win', 1, 0)
    const t2 = t1 + trophyDeltaFor('win', 2, t1)
    const t3 = t2 + trophyDeltaFor('loss', 3, t2)
    expect(after.trophies).toBe(t3)
  })

  it('b. same-round duplicate resend is a trophy no-op (PK conflict)', async () => {
    const acct = await freshAccountId()
    const run = 'run-dup'
    const first = await round(acct, run, 1, 'win')
    const dup = await round(acct, run, 1, 'win')
    expect(first.trophies).toBe(trophyDeltaFor('win', 1, 0))
    expect(dup.trophies).toBe(first.trophies) // the (run,1) tuple already applied
  })

  it('c. a skipped-ahead round now APPLIES (idempotency enforces no ordering)', async () => {
    const acct = await freshAccountId()
    const run = 'run-skip'
    const first = await round(acct, run, 1, 'win')
    // SEMANTICS CHANGE vs the superseded last_run_id/last_round_applied tracker:
    // the tracker no-op'd a skip-ahead (round had to equal lastRoundApplied+1).
    // The idempotency record rejects ONLY exact (account, run, round) duplicates
    // and enforces NO ordering, so a never-seen (run, 3) tuple applies. Intended:
    // global ordering was never actually enforced (the tracker's "unseen run"
    // branch already accepted any round as a new run's first push), so the
    // within-run skip-guard was incidental, not load-bearing.
    const skip = await round(acct, run, 3, 'win') // was a no-op; now applies
    expect(first.trophies).toBe(trophyDeltaFor('win', 1, 0))
    expect(skip.trophies).toBe(first.trophies + trophyDeltaFor('win', 3, first.trophies))
  })

  it('d. an unseen runId is accepted (new tuple)', async () => {
    const acct = await freshAccountId()
    await round(acct, 'run-A', 1, 'win')
    const a2 = await round(acct, 'run-A', 2, 'win')
    const b1 = await round(acct, 'run-B', 1, 'win')
    expect(b1.trophies).toBe(a2.trophies + trophyDeltaFor('win', 1, a2.trophies))
  })

  it('e. concurrent identical run+round — exactly one applies', async () => {
    const acct = await freshAccountId()
    // Two simultaneous round-1 pushes for the SAME run. The applied_round_results
    // PK conflict lets exactly one INSERT win; the other returns no row and
    // no-ops. The win delta lands ONCE, not twice.
    await Promise.all([round(acct, 'run-E', 1, 'win'), round(acct, 'run-E', 1, 'win')])
    const found = await store.findByAccountId(acct)
    expect(found!.trophies).toBe(trophyDeltaFor('win', 1, 0)) // 10, not 20
  })

  it('f. concurrent DIFFERENT-run losses near the floor never net below zero', async () => {
    const acct = await freshAccountId()
    // Arrange a near-floor state through the real API only (deltas can't land an
    // arbitrary value): win to 10, then a loss floors it toward 5.
    await round(acct, 'seed', 1, 'win') // 0 → 10
    const seeded = await round(acct, 'seed', 2, 'loss') // 10 → 5
    const five = 10 + trophyDeltaFor('loss', 2, 10)
    expect(seeded.trophies).toBe(five)

    // Two DIFFERENT runs each report a round-1 loss simultaneously. Both are new
    // tuples, so both pass the idempotency gate and BOTH apply. A naive read-
    // then-write computes both deltas from 5 → 5 + (−5) + (−5) = −5. The
    // SELECT … FOR UPDATE lock makes the second compute its delta from the
    // FLOORED 0, so the floor holds.
    await Promise.all([round(acct, 'run-B', 1, 'loss'), round(acct, 'run-C', 1, 'loss')])
    const found = await store.findByAccountId(acct)
    expect(found!.trophies).toBe(0) // floored, NOT −5
    expect(found!.trophies).toBeGreaterThanOrEqual(0) // the invariant the lock protects
  })

  it('g. a stale retry of a SUPERSEDED run is a no-op (Codex round 1 P1 fix)', async () => {
    const acct = await freshAccountId()
    // Codex's exact scenario. The superseded last_run_id tracker treated the
    // stale run-A retry as "unseen" (lastRunId had advanced to run-B) and
    // re-credited run-A's delta. The idempotency record rejects it: (acct,
    // run-A, 1) already exists, so the retry's INSERT no-ops.
    const a1 = await round(acct, 'run-A', 1, 'win') // 0 → 10
    const b1 = await round(acct, 'run-B', 1, 'win') // 10 → 20 (new tuple)
    const staleA1 = await round(acct, 'run-A', 1, 'win') // delayed retry → no-op

    expect(a1.trophies).toBe(trophyDeltaFor('win', 1, 0)) // 10
    expect(b1.trophies).toBe(a1.trophies + trophyDeltaFor('win', 1, a1.trophies)) // 20
    // run-A round 1 applied exactly ONCE. The bug produced 20 + 10 = 30.
    expect(staleA1.trophies).toBe(b1.trophies) // still 20
  })
})
