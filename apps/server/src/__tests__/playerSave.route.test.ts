// GET/PUT /v1/player/save — status map + streak derivation (M2.1 PR3; PUT
// body reshaped to the Delta trust-model in CF-77 Phase 2 PR1).
//
// SCOPE OF THE FAKES BELOW — read this before extending. Catch 58 named
// exactly this file's shape as the CF-70 anatomy: a fake that hand-mirrors
// the author's belief about an external system, making the belief
// unfalsifiable. The split that keeps it honest:
//   - THIS file fakes the stores to exercise ROUTING: status codes, the
//     auth gate, body validation, and the server-derived streak. Those are
//     properties of the route, not of Postgres, so a fake is the right tool.
//   - The SQL semantics the route depends on (the round-ordering gate, the
//     trophyDeltaFor delta apply, the FK, the date round-trip) are asserted
//     against a REAL Postgres in __tests__/realsql/playerSaveStore.realsql.
//     test.ts. The fake here deliberately claims NOTHING about trophy math.
// If you find yourself writing "mirror the real SQL" in a comment here,
// that belongs in the realsql suite instead.

import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import type { AccountRecord, AccountStore } from '../db/accountStore.js'
import type { ClerkVerifier } from '../clerk/verifier.js'
import type {
  PlayerSaveRecord,
  PlayerSaveStore,
} from '../db/playerSaveStore.js'

const USER_ID = 'user_clerk_1'
const ACCOUNT_ID = 'acct_1'

const verifier: ClerkVerifier = {
  async verify(token) {
    return token === 'good-token' ? USER_ID : null
  },
}

/** A valid PUT body under the Delta model. The trophy fields are a round
 *  report; the server derives the delta. `lastDailyAttempted` is orthogonal. */
const VALID_BODY = {
  runId: 'run-fixture',
  round: 1,
  roundOutcome: 'win',
  lastDailyAttempted: null,
}

/** An account store holding exactly the seeded rows. */
function fakeAccounts(seed: AccountRecord[]): AccountStore {
  return {
    async findByClerkUserId(clerkUserId) {
      return seed.find((r) => r.clerkUserId === clerkUserId) ?? null
    },
    async createIfAbsent() {
      throw new Error('not used by player-save routes')
    },
    async linkAnonIdIfNull() {
      throw new Error('not used by player-save routes')
    },
  }
}

/** In-memory save store. Routing-only: NO round-ordering / delta semantics are
 *  claimed (that is the realsql suite's job — Catch 58). It records the
 *  server-derived daily fields the route computed and echoes a trophy total, so
 *  the status map + streak derivation can be asserted without Postgres. */
function fakeSaves(seed: PlayerSaveRecord | null = null): PlayerSaveStore {
  let row: PlayerSaveRecord | null = seed
  return {
    async findByAccountId(accountId) {
      return row && row.accountId === accountId ? row : null
    },
    async applyRoundResult(input) {
      row = {
        accountId: input.accountId,
        trophies: row?.trophies ?? 0,
        dailyStreak: input.dailyStreak,
        lastDailyAttempted: input.lastDailyAttempted,
        updatedAt: new Date('2026-07-15T00:00:00Z'),
      }
      return row
    },
  }
}

/** A store whose every call throws — the transient-failure path. */
const throwingSaves: PlayerSaveStore = {
  async findByAccountId() {
    throw new Error('connect ECONNREFUSED')
  },
  async applyRoundResult() {
    throw new Error('connect ECONNREFUSED')
  },
}

const LINKED: AccountRecord[] = [
  { id: ACCOUNT_ID, clerkUserId: USER_ID, anonIdAtSignup: 'anon-1' },
]

let app: FastifyInstance | null = null
afterEach(async () => {
  if (app) {
    await app.close()
    app = null
  }
})

function build(opts: {
  accounts?: AccountStore | null
  saves?: PlayerSaveStore | null
  now?: () => Date
}): FastifyInstance {
  app = createApp({
    posthog: null,
    clerk: verifier,
    accountStore: opts.accounts === undefined ? fakeAccounts(LINKED) : opts.accounts,
    playerSaveStore: opts.saves === undefined ? fakeSaves() : opts.saves,
    now: opts.now,
    logLevel: 'silent',
  })
  return app
}

const AUTH = { authorization: 'Bearer good-token' }

describe('GET /v1/player/save', () => {
  it('401 without a valid token', async () => {
    const res = await build({}).inject({ method: 'GET', url: '/v1/player/save' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toEqual({ error: 'auth_required' })
  })

  it('404 account_not_linked when the user has no accounts row', async () => {
    const res = await build({ accounts: fakeAccounts([]) }).inject({
      method: 'GET',
      url: '/v1/player/save',
      headers: AUTH,
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'account_not_linked' })
  })

  it('503 db_unavailable when no store is configured', async () => {
    const res = await build({ saves: null }).inject({
      method: 'GET',
      url: '/v1/player/save',
      headers: AUTH,
    })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ error: 'db_unavailable' })
  })

  it('503 db_unavailable (retryable) on a transient store failure', async () => {
    const res = await build({ saves: throwingSaves }).inject({
      method: 'GET',
      url: '/v1/player/save',
      headers: AUTH,
    })
    expect(res.statusCode).toBe(503)
  })

  // A linked account with no save row is 200-with-defaults, NOT 404 — 404
  // means account_not_linked, whose client remedy (re-link) would be wrong.
  it('200 with zero defaults when the account has never written a save', async () => {
    const res = await build({}).inject({
      method: 'GET',
      url: '/v1/player/save',
      headers: AUTH,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({
      trophies: 0,
      dailyStreak: 0,
      lastDailyAttempted: null,
    })
  })

  it('200 with the stored save', async () => {
    const res = await build({
      saves: fakeSaves({
        accountId: ACCOUNT_ID,
        trophies: 42,
        dailyStreak: 3,
        lastDailyAttempted: '2026-07-14',
        updatedAt: new Date(),
      }),
    }).inject({ method: 'GET', url: '/v1/player/save', headers: AUTH })
    expect(res.statusCode).toBe(200)
    // The GET DTO is unchanged by CF-77 — trophies/dailyStreak/lastDailyAttempted.
    expect(res.json()).toEqual({
      trophies: 42,
      dailyStreak: 3,
      lastDailyAttempted: '2026-07-14',
    })
  })
})

describe('PUT /v1/player/save — routing + body validation', () => {
  it('401 without a valid token', async () => {
    const res = await build({}).inject({
      method: 'PUT',
      url: '/v1/player/save',
      payload: VALID_BODY,
    })
    expect(res.statusCode).toBe(401)
  })

  it('404 account_not_linked when the user has no accounts row', async () => {
    const res = await build({ accounts: fakeAccounts([]) }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: VALID_BODY,
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toEqual({ error: 'account_not_linked' })
  })

  it('503 when no store is configured', async () => {
    const res = await build({ saves: null }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: VALID_BODY,
    })
    expect(res.statusCode).toBe(503)
  })

  // THE RATIFIED INVARIANT: dailyStreak is NEVER client-settable. .strict()
  // makes a body carrying it a 400 rather than a silent drop — a silent drop
  // would let the client believe it set the streak.
  it('400 when the body carries dailyStreak', async () => {
    const res = await build({}).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, dailyStreak: 99 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_body')
  })

  // .strict() also rejects the RETIRED `trophies` field — the client can no
  // longer send a trophy value at all (Delta model). A stale client still
  // sending it gets an honest 400, not a silent accept.
  it('400 when the body carries a (retired) trophies field', async () => {
    const res = await build({}).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, trophies: 500 },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_body')
  })

  it('400 on a missing / empty runId', async () => {
    for (const runId of [undefined, '']) {
      const res = await build({}).inject({
        method: 'PUT',
        url: '/v1/player/save',
        headers: AUTH,
        payload: { ...VALID_BODY, runId },
      })
      expect(res.statusCode, `expected 400 for runId=${String(runId)}`).toBe(400)
    }
  })

  it('400 on a non-integer, zero, or negative round', async () => {
    for (const round of [1.5, 0, -3]) {
      const res = await build({}).inject({
        method: 'PUT',
        url: '/v1/player/save',
        headers: AUTH,
        payload: { ...VALID_BODY, round },
      })
      expect(res.statusCode, `expected 400 for round=${round}`).toBe(400)
    }
  })

  // A real boss round (11 — the canon max) is accepted; a round far above the
  // canon-derived run-length cap is rejected. round: 1000 was ACCEPTED under the
  // old 10000 ceiling and is now a 400 — this pins the CF-77 round-3 tightening.
  it('accepts the canon max round (11, boss) but 400s a round far above the run-length cap', async () => {
    const boss = await build({}).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, round: 11 },
    })
    expect(boss.statusCode, 'boss round 11 must be accepted').toBe(200)

    const res = await build({}).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, round: 1000 },
    })
    expect(res.statusCode).toBe(400)
  })

  it('400 on an unrecognized roundOutcome', async () => {
    for (const roundOutcome of ['draw', 'WIN', 'player_win', 42]) {
      const res = await build({}).inject({
        method: 'PUT',
        url: '/v1/player/save',
        headers: AUTH,
        payload: { ...VALID_BODY, roundOutcome },
      })
      expect(res.statusCode, `expected 400 for ${String(roundOutcome)}`).toBe(400)
    }
  })

  it('400 on a malformed or unreal date', async () => {
    for (const bad of ['2026-7-4', '07-04-2026', '2026-02-30', 'yesterday']) {
      const res = await build({}).inject({
        method: 'PUT',
        url: '/v1/player/save',
        headers: AUTH,
        payload: { ...VALID_BODY, lastDailyAttempted: bad },
      })
      expect(res.statusCode, `expected 400 for ${bad}`).toBe(400)
    }
  })

  it('400 on a future lastDailyAttempted', async () => {
    const res = await build({ now: () => new Date('2026-07-15T12:00:00Z') }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-16' },
    })
    expect(res.statusCode).toBe(400)
  })

  // Codex round 2, P1 — the stale half of the same gate. A PAST date is a
  // claim about a day that has already closed; persisting it is what re-armed
  // the streak-inflation exploit (see the sequence test below).
  it('400 on a STALE (past) lastDailyAttempted', async () => {
    const res = await build({ now: () => new Date('2026-07-15T12:00:00Z') }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-14' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe('invalid_body')
  })

  it('200 on a well-formed round report (Delta model)', async () => {
    const res = await build({}).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: VALID_BODY,
    })
    expect(res.statusCode).toBe(200)
    // Response SHAPE is a routing concern; the trophy VALUE is the realsql
    // suite's (the fake claims no delta math). null attempt ⇒ streak 0.
    expect(res.json().dailyStreak).toBe(0)
    expect(res.json().lastDailyAttempted).toBeNull()
    expect(typeof res.json().trophies).toBe('number')
  })
})

describe('PUT /v1/player/save — server-derived dailyStreak', () => {
  const NOW = () => new Date('2026-07-15T12:00:00Z')

  function withPrev(prev: { dailyStreak: number; lastDailyAttempted: string | null }) {
    return build({
      now: NOW,
      saves: fakeSaves({
        accountId: ACCOUNT_ID,
        trophies: 0,
        dailyStreak: prev.dailyStreak,
        lastDailyAttempted: prev.lastDailyAttempted,
        updatedAt: new Date(),
      }),
    })
  }

  it('yesterday → +1', async () => {
    const res = await withPrev({ dailyStreak: 4, lastDailyAttempted: '2026-07-14' }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-15' },
    })
    expect(res.json().dailyStreak).toBe(5)
  })

  it('today → unchanged (a same-day re-PUT must not double-count)', async () => {
    const res = await withPrev({ dailyStreak: 4, lastDailyAttempted: '2026-07-15' }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-15' },
    })
    expect(res.json().dailyStreak).toBe(4)
  })

  it('gap → reset to 1', async () => {
    const res = await withPrev({ dailyStreak: 9, lastDailyAttempted: '2026-07-01' }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-15' },
    })
    expect(res.json().dailyStreak).toBe(1)
  })

  it('null attempt → 0, regardless of the stored streak', async () => {
    const res = await withPrev({ dailyStreak: 9, lastDailyAttempted: '2026-07-14' }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: null },
    })
    expect(res.json().dailyStreak).toBe(0)
  })

  // ── Codex round 2, P1: STREAK-INFLATION EXPLOIT, end-to-end regression ──
  //
  // The proven pre-fix sequence: alternating (yesterday, today) PUTs drove the
  // streak 2→3→4→5→6 on ONE server day, because each stale PUT re-persisted
  // yesterday and re-armed the "+1 from yesterday" branch. dailyStreak being
  // absent from the body did NOT prevent it — the client steered the streak
  // via lastDailyAttempted instead.
  //
  // Drives the REAL route through the REAL store fake with a FROZEN clock, so
  // the whole server day is a single instant. Asserts the ceiling: one
  // legitimate yesterday→today transition, and no more, however many times the
  // pair is replayed. Orthogonal to CF-77's trophy path — the trophy fields are
  // fixed across every PUT here.
  it('EXPLOIT REGRESSION: alternating stale/today PUTs cannot inflate the streak', async () => {
    const NOW = () => new Date('2026-07-15T12:00:00Z')
    const YESTERDAY = '2026-07-14'
    const TODAY = '2026-07-15'

    // Seed the row as if yesterday's legitimate attempt already landed.
    const app0 = build({
      now: NOW,
      saves: fakeSaves({
        accountId: ACCOUNT_ID,
        trophies: 0,
        dailyStreak: 1,
        lastDailyAttempted: YESTERDAY,
        updatedAt: new Date(),
      }),
    })

    const put = (lastDailyAttempted: string) =>
      app0.inject({
        method: 'PUT',
        url: '/v1/player/save',
        headers: AUTH,
        payload: { ...VALID_BODY, lastDailyAttempted },
      })

    // One legitimate transition: yesterday(stored) → today ⇒ streak 1 → 2.
    const first = await put(TODAY)
    expect(first.statusCode).toBe(200)
    expect(first.json().dailyStreak).toBe(2)

    // Now replay the exploit pair. Each stale PUT must be REFUSED (400) so the
    // stored date can never regress to yesterday and re-arm the +1 branch.
    for (let i = 0; i < 5; i++) {
      const stale = await put(YESTERDAY)
      expect(stale.statusCode, 'stale PUT must be rejected').toBe(400)
      const again = await put(TODAY)
      expect(again.statusCode).toBe(200)
      // The ceiling: still 2. Pre-fix this read 3, 4, 5, 6, 7…
      expect(again.json().dailyStreak, `inflated on iteration ${i}`).toBe(2)
    }

    // Final read: the day's streak is exactly one increment, not six.
    const final = await app0.inject({ method: 'GET', url: '/v1/player/save', headers: AUTH })
    expect(final.json().dailyStreak).toBe(2)
    expect(final.json().lastDailyAttempted).toBe(TODAY)
  })

  // The rule exists to be cheat-resistant: a client cannot inflate the
  // streak by sending one, because the body cannot carry it at all (400)
  // and the value is computed from stored state + the SERVER's clock.
  it('ignores any client-supplied streak — derivation is server-side only', async () => {
    const res = await withPrev({ dailyStreak: 1, lastDailyAttempted: '2026-07-14' }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-15', dailyStreak: 999 },
    })
    expect(res.statusCode).toBe(400)
  })
})
