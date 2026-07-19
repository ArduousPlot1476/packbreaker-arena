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
    // ROUTING stand-in ONLY (Catch 58): reflects the streak from the daily
    // identity the ROUTE forwarded, so a route that DROPS or FABRICATES
    // dailyContractId / dailyDate is observable at this layer. Makes NO claim
    // about deriveDailyStreak's branch math or Postgres semantics — those are the
    // unit test's (db/deriveDailyStreak.test.ts) and the realsql suite's jobs.
    async applyRoundResult(input) {
      const prevStreak = row?.dailyStreak ?? 0
      const prevLast = row?.lastDailyAttempted ?? null
      const dailyMatch =
        input.dailyContractId !== null &&
        input.dailyDate !== null &&
        input.dailyDate === input.serverToday &&
        input.dailyContractId === input.serverDailyContractId
      row = {
        accountId: input.accountId,
        trophies: (row?.trophies ?? 0) + 1, // stand-in delta (> 0) so trophies move
        dailyStreak: dailyMatch ? prevStreak + 1 : prevStreak,
        lastDailyAttempted: dailyMatch ? input.dailyDate : prevLast,
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

  // PA9 / TT3 (ratified — do NOT restore the gate): the server-date gate that
  // 400'd a non-today lastDailyAttempted is GONE. The field is accepted-and-unread
  // (PA1 / PA8), so a future OR stale date is now TOLERATED (200). These two carry
  // the old gate's scenarios under RENAMED names so a future reader sees the
  // contract flipped deliberately, not by accident (decision-log.md 2026-07-18
  // § "CF-68 PR-A test-topology dispositions RATIFIED", TT3).
  it('200 (was 400 pre-PA9): a FUTURE lastDailyAttempted is tolerated, accepted-and-unread', async () => {
    const res = await build({ now: () => new Date('2026-07-15T12:00:00Z') }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-16' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('200 (was 400 pre-PA9): a STALE (past) lastDailyAttempted is tolerated, accepted-and-unread', async () => {
    const res = await build({ now: () => new Date('2026-07-15T12:00:00Z') }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: { ...VALID_BODY, lastDailyAttempted: '2026-07-14' },
    })
    expect(res.statusCode).toBe(200)
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
    // suite's (the fake claims no delta math). A non-daily push (no daily
    // identity) moves no streak field, so a fresh account stays at streak 0.
    expect(res.json().dailyStreak).toBe(0)
    expect(res.json().lastDailyAttempted).toBeNull()
    expect(typeof res.json().trophies).toBe('number')
  })
})

// CF-68 PR-A (TT2 / TT3): the old `PUT /v1/player/save — server-derived
// dailyStreak` describe block (yesterday→+1 / today→unchanged / gap→reset /
// null→0 / EXPLOIT REGRESSION / ignores-client-streak) was DELETED — it drove the
// removed client-lastDailyAttempted derivation path, and its threat model is
// defunct once the field is unread. deriveDailyStreak's branch logic now lives in
// db/deriveDailyStreak.test.ts (Layer A); the persisted daily behavior lives in
// the realsql suite (Layer B). The `.strict()` dailyStreak rejection is preserved
// by '400 when the body carries dailyStreak' above. These route tests are the
// HTTP-tolerance + route-pass-through layer (TT4).
describe('PUT /v1/player/save — CF-68 daily participation (route layer)', () => {
  const NOW = () => new Date('2026-07-15T12:00:00Z')
  const TODAY = '2026-07-15'
  // The sole isDaily contract id (contracts.ts). buildDailyContract(NOW) returns
  // this id + TODAY, so a daily-bearing PUT must echo both to be forwarded as a
  // match by the route.
  const DAILY_ID = 'daily-placeholder'
  const DAILY_BODY = { ...VALID_BODY, dailyContractId: DAILY_ID, dailyDate: TODAY }

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

  // TT3: PA8 made lastDailyAttempted `.optional()`, and dailyContractId / dailyDate
  // are `.optional()` too — so a body OMITTING all three must validate (200). This
  // case had no test because the field was previously required-nullable.
  it('200 when lastDailyAttempted (and the daily fields) are ABSENT entirely', async () => {
    const noDaily = {
      runId: VALID_BODY.runId,
      round: VALID_BODY.round,
      roundOutcome: VALID_BODY.roundOutcome,
    }
    const res = await build({}).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: noDaily,
    })
    expect(res.statusCode).toBe(200)
  })

  // TT2a — HOSTILE-PAYLOAD successor (threat-lineage descendant of the deleted
  // EXPLOIT REGRESSION test). The client's lastDailyAttempted must NOT move the
  // streak: a non-daily-bearing PUT carrying lastDailyAttempted = today moves
  // neither dailyStreak nor last_daily_attempted, however many times it is
  // replayed with alternating values. Rule 28 falsifiable: wire the client field
  // back into the forwarded daily identity at the route and this fails.
  it('HOSTILE PAYLOAD: client lastDailyAttempted cannot move the streak (no daily identity)', async () => {
    const app0 = withPrev({ dailyStreak: 3, lastDailyAttempted: '2026-07-14' })
    const put = (lastDailyAttempted: string) =>
      app0.inject({
        method: 'PUT',
        url: '/v1/player/save',
        headers: AUTH,
        payload: { ...VALID_BODY, lastDailyAttempted },
      })
    for (const d of [TODAY, '2026-07-14', TODAY, '2026-07-13', TODAY]) {
      const res = await put(d)
      expect(res.statusCode).toBe(200)
      // No daily identity was sent, so nothing daily may move.
      expect(res.json().dailyStreak, `moved on lastDailyAttempted=${d}`).toBe(3)
      expect(res.json().lastDailyAttempted).toBe('2026-07-14')
    }
  })

  // TT2b — PASS-THROUGH successor. The ONLY coverage that catches the route
  // failing to FORWARD dailyContractId / dailyDate (store tests start after the
  // route). A daily-bearing PUT advances the streak; a non-daily PUT does not.
  it('PASS-THROUGH: a daily-bearing PUT advances the streak; a non-daily PUT does not', async () => {
    const daily = await withPrev({ dailyStreak: 4, lastDailyAttempted: '2026-07-14' }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: DAILY_BODY,
    })
    expect(daily.statusCode).toBe(200)
    expect(daily.json().dailyStreak).toBe(5) // forwarded identity matched ⇒ advanced
    expect(daily.json().lastDailyAttempted).toBe(TODAY)

    const nonDaily = await withPrev({ dailyStreak: 4, lastDailyAttempted: '2026-07-14' }).inject({
      method: 'PUT',
      url: '/v1/player/save',
      headers: AUTH,
      payload: VALID_BODY,
    })
    expect(nonDaily.statusCode).toBe(200)
    expect(nonDaily.json().dailyStreak).toBe(4) // no daily identity ⇒ unchanged
  })
})
