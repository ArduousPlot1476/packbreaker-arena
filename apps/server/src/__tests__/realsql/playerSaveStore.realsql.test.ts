// player_saves against REAL Postgres (M2.1 PR3; CF-77 Phase 2 PR1 trophy path).
//
// The ratified requirement: "PR3 MUST include a real-Postgres test for
// player_saves … a fake-store-only plan is REJECTED" (decision-log.md
// 2026-07-14 § "M2.1 PR3 PHASE 1 RATIFIED"). CF-77 Phase 2 keeps that bar: the
// round-ordering gate + the trophyDeltaFor delta apply are SQL/transaction
// semantics (SELECT … FOR UPDATE serialization, the ON CONFLICT ensure-insert,
// the atomic increment), so they are asserted HERE against real Postgres, never
// against the routing fake — the whole point of Form ① is a property a fake
// cannot exhibit (Catch 58 / Rule 4).
//
// The 6 CF-77 scenarios (decision-log.md 2026-07-17 § "CF-77 Phase 2 PR1"):
//   a. sequential same-run apply — deltas accumulate in order
//   b. same-round duplicate resend → trophy no-op
//   c. skip-ahead round → no-op
//   d. unseen runId after a prior run → accepts, resets the tracker
//   e. concurrent identical run+round → exactly one applies
//   f. concurrent DIFFERENT-run losses near the floor → never net below zero
//      (the case Form ① exists to protect: a naive read-then-write nets −5).
//
// Expected trophy values are computed via `trophyDeltaFor` (imported), NOT
// hand-literals: this asserts "the store threads the SCHEDULE correctly through
// the gate + accumulation" without pinning numbers that would co-drift if the
// schedule changed. trophyDeltaFor's own arithmetic is covered by packages/sim.
//
// Every test drives createPlayerSaveStore — the same function index.ts wires in
// production — never a fake.

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
  // trophy totals + trackers never bleed between tests. A counter (not
  // Date.now/random) keeps ids stable per run.
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

  // ── Structural (adapted from the PR3 upsert tests to applyRoundResult) ──

  it('findByAccountId returns null before any write', async () => {
    expect(await store.findByAccountId(await freshAccountId())).toBeNull()
  })

  // The FK IS the 1:1 constraint (PK **is** the FK). A round for a non-existent
  // account must be rejected BY POSTGRES (the ensure-insert's FK), not app code.
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

  // Catch 59, carried forward. applyRoundResult sets `updatedAt: sql`now()`` in
  // BOTH branches (apply + no-op). Drop it and updated_at silently FREEZES at
  // insert time — every other test still passes, because none of them read it
  // (Catch 58's anatomy). A DUPLICATE resend is the isolating case: the trophy
  // half no-ops, so only the explicit now() in the no-op branch can move
  // updated_at here.
  it('updated_at advances on a no-op (duplicate) resend', async () => {
    const acct = await freshAccountId()
    const first = await round(acct, 'run-uat', 1, 'win')

    // CLOCK GUARD (Catch 59, Codex round 4 P2). Postgres timestamptz is µs;
    // node-postgres hands back a ms-resolution JS Date, so a sub-ms advance
    // collapses to the same getTime() and the strict assertion flakes. Local
    // Neon's 40–55ms round-trips masked this by accident; CI's localhost
    // container lands two writes in the same ms routinely. 10ms clears the 1ms
    // boundary. Relaxing to >= would pass in the exact scenario this catches.
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Duplicate round-1 resend — a trophy no-op (round 1 ≠ lastRoundApplied+1).
    const dup = await round(acct, 'run-uat', 1, 'win')
    expect(dup.trophies).toBe(first.trophies) // trophy half no-op'd
    expect(dup.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime())
  })

  it('ON DELETE CASCADE removes the save when its account is deleted', async () => {
    const acct = await freshAccountId()
    await round(acct, 'run-cascade', 1, 'win')
    expect(await store.findByAccountId(acct)).not.toBeNull()
    await real.pool.query('DELETE FROM accounts WHERE id = $1', [acct])
    expect(await store.findByAccountId(acct)).toBeNull()
  })

  // ── The 6 CF-77 scenarios ──

  it('a. sequential same-run apply — deltas accumulate in order', async () => {
    const acct = await freshAccountId()
    const run = 'run-seq'
    await round(acct, run, 1, 'win')
    await round(acct, run, 2, 'win')
    const after = await round(acct, run, 3, 'loss')

    // Recompute the expected total via the SAME schedule the store uses.
    const t1 = 0 + trophyDeltaFor('win', 1, 0)
    const t2 = t1 + trophyDeltaFor('win', 2, t1)
    const t3 = t2 + trophyDeltaFor('loss', 3, t2)
    expect(after.trophies).toBe(t3)
    expect(after.lastRunId).toBe(run)
    expect(after.lastRoundApplied).toBe(3)
  })

  it('b. same-round duplicate resend is a trophy no-op', async () => {
    const acct = await freshAccountId()
    const run = 'run-dup'
    const first = await round(acct, run, 1, 'win')
    const dup = await round(acct, run, 1, 'win')
    expect(first.trophies).toBe(trophyDeltaFor('win', 1, 0))
    expect(dup.trophies).toBe(first.trophies) // unchanged — applied once
    expect(dup.lastRoundApplied).toBe(1)
  })

  it('c. skip-ahead round is a no-op (round must be strictly next)', async () => {
    const acct = await freshAccountId()
    const run = 'run-skip'
    const first = await round(acct, run, 1, 'win')
    const skip = await round(acct, run, 3, 'win') // skips round 2
    expect(skip.trophies).toBe(first.trophies) // rejected — needs round 2
    expect(skip.lastRoundApplied).toBe(1)
  })

  it('d. an unseen runId after a prior run is accepted and resets the tracker', async () => {
    const acct = await freshAccountId()
    await round(acct, 'run-A', 1, 'win')
    const a2 = await round(acct, 'run-A', 2, 'win')
    // New run B, round 1 — unseen ⇒ accepted, tracker reset to (B, 1).
    const b1 = await round(acct, 'run-B', 1, 'win')
    expect(b1.trophies).toBe(a2.trophies + trophyDeltaFor('win', 1, a2.trophies))
    expect(b1.lastRunId).toBe('run-B')
    expect(b1.lastRoundApplied).toBe(1)
  })

  it('e. concurrent identical run+round — exactly one applies', async () => {
    const acct = await freshAccountId()
    // Two simultaneous round-1 pushes for the SAME run. FOR UPDATE serializes
    // them; the second sees lastRoundApplied=1 and no-ops. The win delta lands
    // ONCE, not twice.
    await Promise.all([round(acct, 'run-E', 1, 'win'), round(acct, 'run-E', 1, 'win')])
    const found = await store.findByAccountId(acct)
    expect(found!.trophies).toBe(trophyDeltaFor('win', 1, 0)) // 10, not 20
    expect(found!.lastRoundApplied).toBe(1)
  })

  it('f. concurrent DIFFERENT-run losses near the floor never net below zero', async () => {
    const acct = await freshAccountId()
    // Arrange a near-floor state through the real API only (deltas can't land an
    // arbitrary value): win to 10, then a loss floors it toward 5.
    await round(acct, 'seed', 1, 'win') // 0 → 10
    const seeded = await round(acct, 'seed', 2, 'loss') // 10 → 5
    const five = 10 + trophyDeltaFor('loss', 2, 10)
    expect(seeded.trophies).toBe(five)

    // Two DIFFERENT runs each report a round-1 loss simultaneously. Both are
    // unseen, so both pass the gate and BOTH apply. A naive read-then-write
    // computes both deltas from 5 → 5 + (−5) + (−5) = −5. Form ①'s row lock
    // makes the second compute its delta from the FLOORED 0, so the floor holds.
    await Promise.all([round(acct, 'run-B', 1, 'loss'), round(acct, 'run-C', 1, 'loss')])
    const found = await store.findByAccountId(acct)
    expect(found!.trophies).toBe(0) // floored, NOT −5
    expect(found!.trophies).toBeGreaterThanOrEqual(0) // the invariant Form ① protects
  })
})
