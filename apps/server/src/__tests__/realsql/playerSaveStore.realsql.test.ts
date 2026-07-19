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
//      (pins the loss floor; NOTE — since the round-2 absolute-write change this
//      no longer discriminates on FOR UPDATE; see the test + scenario i)
//   g. STALE retry of a superseded run → no-op (the Codex round 1 P1 fix — the
//      old last_run_id tracker re-credited this; the idempotency record rejects it)
//   h. cumulative trophies saturate at int4 max + clamp warning (Codex round 2 P2)
//   i. concurrent DISTINCT-tuple wins all apply — the FOR UPDATE lost-update guard
//      (the test that actually falsifies a missing lock; proven in CI)
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
    store = createPlayerSaveStore(real.db, { warn: () => {} })
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

  // CF-68 PR-A daily-identity constants. The store verifies a push's claimed
  // (dailyContractId, dailyDate) against these server-truth values; a `dailyRound`
  // whose claim equals them MATCHES and records participation, one whose claim
  // differs is a silent skip (PA6). SERVER_TODAY is a fixed instant so the whole
  // suite shares one "today".
  const SERVER_TODAY = '2026-07-15'
  const DAILY_ID = 'daily-placeholder'

  /** A NEUTRAL (non-daily) round report — the trophy scenarios' default. No daily
   *  identity is claimed, so the store writes trophies ONLY (PA3 invariant). */
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
      dailyContractId: null,
      dailyDate: null,
      serverToday: SERVER_TODAY,
      serverDailyContractId: DAILY_ID,
    })
  }

  /** A DAILY-BEARING round report. Defaults MATCH the server truth (dailyDate =
   *  SERVER_TODAY, contract id = DAILY_ID) so a plain call is a valid daily
   *  attempt; override `opts` to construct an identity MISMATCH. */
  function dailyRound(
    accountId: string,
    runId: string,
    r: number,
    roundOutcome: 'win' | 'loss',
    opts: { dailyContractId?: string; dailyDate?: string } = {},
  ) {
    return store.applyRoundResult({
      accountId,
      runId,
      round: r,
      roundOutcome,
      dailyContractId: opts.dailyContractId ?? DAILY_ID,
      dailyDate: opts.dailyDate ?? SERVER_TODAY,
      serverToday: SERVER_TODAY,
      serverDailyContractId: DAILY_ID,
    })
  }

  /** Count of participation rows for an account (raw SQL — the store exposes no
   *  daily_participation reader; the harness schema is search_path-pinned). */
  async function participationCount(accountId: string): Promise<number> {
    const res = await real.pool.query(
      'SELECT count(*)::int AS n FROM daily_participation WHERE account_id = $1',
      [accountId],
    )
    return (res.rows[0] as { n: number }).n
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

  // player_saves.last_daily_attempted is pg `date` mode:'string' — it round-trips
  // through the STORE (drizzle) as a plain YYYY-MM-DD string, NOT a JS Date (which
  // would break the IsoDate brand). A daily round writes it (= the verified date).
  // (daily_participation.daily_date shares the mode but is never read through
  // drizzle in production; a raw pool.query would return a Date, so it is not
  // asserted here — scenario j pins its stored value via a date-string WHERE.)
  it('last_daily_attempted round-trips as a YYYY-MM-DD string, not a Date', async () => {
    const acct = await freshAccountId()
    const saved = await dailyRound(acct, 'run-date', 1, 'win')
    expect(saved.lastDailyAttempted).toBe(SERVER_TODAY)
    expect(typeof saved.lastDailyAttempted).toBe('string')
    const found = await store.findByAccountId(acct)
    expect(found!.lastDailyAttempted).toBe(SERVER_TODAY)
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

    // Two DIFFERENT runs each report a round-1 loss simultaneously; both are new
    // tuples, so both apply and the floor must hold (result 0, never below).
    //
    // ⚠ COVERAGE NOTE (adversarial review, CF-77 round-3 bundle): this scenario
    // NO LONGER discriminates on the SELECT … FOR UPDATE lock, and must not be
    // relied on to. Since the round-2 saturation fix, the store writes an
    // ABSOLUTE value (trophies = Math.min(locked + delta, INT4_MAX)); for a loss
    // that absolute is max(0, current − 5), which is ≥ 0 for ANY read value. So
    // both a locked run (5→0→0) and an unlocked run (both read 5, both write 0)
    // yield 0 — the lock is invisible here, and `>= 0` can never fail for a loss.
    // The lock IS still load-bearing (it prevents lost updates on the
    // current-INDEPENDENT win delta) — that is what scenario i falsifies. Kept
    // because it still correctly pins the loss floor.
    await Promise.all([round(acct, 'run-B', 1, 'loss'), round(acct, 'run-C', 1, 'loss')])
    const found = await store.findByAccountId(acct)
    expect(found!.trophies).toBe(0) // floored — the loss floor holds
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

  it('h. cumulative trophies saturate at int4 max, with a clamp warning (Codex round 2 P2)', async () => {
    const acct = await freshAccountId()
    // 2^31 − 1, the pg int4 ceiling (an immutable DB fact, not a schedule number).
    const INT4_MAX = 2_147_483_647
    // A store with a spy logger so the clamp warning is observable (the
    // established seam-logger test convention — clerk.test.ts / env.test.ts).
    const warns: string[] = []
    const spyStore = createPlayerSaveStore(real.db, { warn: (m) => warns.push(m) })

    // Create the row, then raw-set trophies just below the ceiling — deltas
    // can't legitimately reach int4 max, so arrange it directly.
    await spyStore.applyRoundResult({
      accountId: acct,
      runId: 'run-ovf',
      round: 1,
      roundOutcome: 'win',
      dailyContractId: null,
      dailyDate: null,
      serverToday: SERVER_TODAY,
      serverDailyContractId: DAILY_ID,
    })
    await real.pool.query('UPDATE player_saves SET trophies = $1 WHERE account_id = $2', [
      INT4_MAX - 5,
      acct,
    ])

    // A distinct-round win (delta > 5) makes the raw sum exceed int4 max: it must
    // SATURATE at the ceiling (not throw `integer out of range`, not wrap) and log.
    const saturated = await spyStore.applyRoundResult({
      accountId: acct,
      runId: 'run-ovf',
      round: 2,
      roundOutcome: 'win',
      dailyContractId: null,
      dailyDate: null,
      serverToday: SERVER_TODAY,
      serverDailyContractId: DAILY_ID,
    })
    expect(saturated.trophies).toBe(INT4_MAX)
    expect(warns.some((w) => w.includes('int4 max'))).toBe(true)

    // Persisted, not just returned.
    const found = await store.findByAccountId(acct)
    expect(found!.trophies).toBe(INT4_MAX)
  })

  it('i. concurrent DISTINCT-tuple wins all apply — the FOR UPDATE lost-update guard', async () => {
    const acct = await freshAccountId()
    const base = trophyDeltaFor('win', 1, 0) // round-1 win delta (current-independent)

    // SEED so the player_saves row EXISTS first. This is essential: on a fresh
    // account the ensure-insert's own ON CONFLICT blocking would serialize the
    // writers and MASK the lock (which is why scenarios e/f can't guard it). With
    // the row present the ensure-insert no-ops and ONLY SELECT … FOR UPDATE
    // serializes.
    await round(acct, 'seed', 1, 'win') // trophies = base

    // N distinct-tuple round-1 wins fire at once — all are new tuples, so all must
    // apply: base → base·(N+1). The store writes an ABSOLUTE value
    // (trophies = Math.min(locked + delta, INT4_MAX)), so WITHOUT the lock the
    // concurrent readers see the same stale total and clobber one another (lost
    // updates), landing far below the sum; WITH it, each reads the prior commit
    // and all N apply. N writers make the lost update near-certain rather than a
    // rare interleaving. This is the test that FALSIFIES a missing FOR UPDATE
    // (removing the lock makes this assertion fail — proven in CI, see the PR /
    // decision-log). N=8 stays under the pg pool's default max (10) so all writers
    // run truly concurrently.
    const N = 8
    await Promise.all(
      Array.from({ length: N }, (_, k) => round(acct, `run-cc-${k}`, 1, 'win')),
    )
    const foundI = await store.findByAccountId(acct)
    expect(foundI!.trophies).toBe(base * (N + 1)) // seed + N wins, all applied
  })

  // ── CF-68 PR-A — daily participation (PA3–PA6) ──

  it('j. first daily round records participation and advances the streak', async () => {
    const acct = await freshAccountId()
    const saved = await dailyRound(acct, 'run-d', 1, 'win')
    expect(await participationCount(acct)).toBe(1)
    const row = await real.pool.query(
      'SELECT run_id, contract_id FROM daily_participation WHERE account_id = $1 AND daily_date = $2',
      [acct, SERVER_TODAY],
    )
    expect(row.rows[0]).toEqual({ run_id: 'run-d', contract_id: DAILY_ID })
    expect(saved.dailyStreak).toBe(1) // never-attempted ⇒ 1
    expect(saved.lastDailyAttempted).toBe(SERVER_TODAY)
  })

  it('k. a second same-day round no-ops participation and holds the streak flat', async () => {
    const acct = await freshAccountId()
    await dailyRound(acct, 'run-d', 1, 'win') // streak → 1, participation written
    const second = await dailyRound(acct, 'run-d', 2, 'win') // new round tuple, same day
    expect(await participationCount(acct)).toBe(1) // ON CONFLICT no-op on round 2
    expect(second.dailyStreak).toBe(1) // same-day guard holds it flat
    expect(second.lastDailyAttempted).toBe(SERVER_TODAY)
  })

  it('l. a refire (duplicate round tuple) touches neither participation nor the streak', async () => {
    const acct = await freshAccountId()
    const first = await dailyRound(acct, 'run-d', 1, 'win')
    const refire = await dailyRound(acct, 'run-d', 1, 'win') // SAME (acct, run, round)
    expect(await participationCount(acct)).toBe(1)
    expect(refire.dailyStreak).toBe(first.dailyStreak)
    expect(refire.trophies).toBe(first.trophies) // idempotent no-op, no re-credit
  })

  // PA3 HARD INVARIANT (Rule 28 falsification target #1): a neutral round must
  // move NO streak field. Establish a streak with a daily round, then a neutral
  // round must leave dailyStreak + last_daily_attempted untouched while trophies
  // move. Remove the daily-match guard around the streak write and this fails.
  it('m. a neutral (non-daily) round records no participation and moves no streak field', async () => {
    const acct = await freshAccountId()
    const d = await dailyRound(acct, 'run-daily', 1, 'win') // streak 1, last = today
    const n = await round(acct, 'run-neutral', 1, 'win') // neutral: trophies only
    expect(await participationCount(acct)).toBe(1) // only the daily run's row
    expect(n.dailyStreak).toBe(d.dailyStreak) // streak UNTOUCHED by the neutral round
    expect(n.lastDailyAttempted).toBe(d.lastDailyAttempted) // last_daily_attempted UNTOUCHED
    expect(n.trophies).toBeGreaterThan(d.trophies) // ...but trophies DID move
  })

  // PA6: an identity MISMATCH (stale date, or wrong contract id) is a SILENT skip
  // — no participation, no streak move, and the round push still SUCCEEDS.
  it('n. an identity-mismatched daily push succeeds with no participation', async () => {
    const staleAcct = await freshAccountId()
    const stale = await dailyRound(staleAcct, 'run-stale', 1, 'win', { dailyDate: '2026-07-14' })
    expect(stale.trophies).toBe(trophyDeltaFor('win', 1, 0)) // push succeeded
    expect(stale.dailyStreak).toBe(0) // untouched
    expect(await participationCount(staleAcct)).toBe(0)

    const wrongIdAcct = await freshAccountId()
    const wrongId = await dailyRound(wrongIdAcct, 'run-wrongid', 1, 'win', {
      dailyContractId: 'not-the-daily',
    })
    expect(wrongId.trophies).toBe(trophyDeltaFor('win', 1, 0))
    expect(wrongId.dailyStreak).toBe(0)
    expect(await participationCount(wrongIdAcct)).toBe(0)
  })
})
