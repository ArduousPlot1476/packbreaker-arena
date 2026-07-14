// POST /v1/account/link — enforcement + three idempotency paths (M2.1 PR2.5).
//
// No live credentials: a fake ClerkVerifier authenticates 'good-token' as a
// fixed userId, and an in-memory fake AccountStore stands in for drizzle so
// the create / link-if-null / no-op paths are exercised without Postgres.

import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import type { AccountRecord, AccountStore } from '../db/accountStore.js'
import type { ClerkVerifier } from '../clerk/verifier.js'

const USER_ID = 'user_clerk_1'
const ANON_A = '550e8400-e29b-41d4-a716-446655440000'
const ANON_B = '11111111-2222-4333-8444-555566667777'

const verifier: ClerkVerifier = {
  async verify(token) {
    return token === 'good-token' ? USER_ID : null
  },
}

function makeFakeAccountStore(seed: AccountRecord[] = []): {
  store: AccountStore
  get: (clerkUserId: string) => AccountRecord | null
} {
  const byClerk = new Map<string, AccountRecord>()
  for (const r of seed) byClerk.set(r.clerkUserId, r)
  let n = seed.length
  const store: AccountStore = {
    async findByClerkUserId(clerkUserId) {
      return byClerk.get(clerkUserId) ?? null
    },
    async createIfAbsent(input) {
      // Mirror ON CONFLICT (clerk_user_id) DO NOTHING: the has+set is one
      // synchronous step, so concurrent injects serialize atomically —
      // exactly one insert wins, the rest return null (conflict).
      if (byClerk.has(input.clerkUserId)) return null
      n += 1
      const rec: AccountRecord = {
        id: `acct_${n}`,
        clerkUserId: input.clerkUserId,
        anonIdAtSignup: input.anonIdAtSignup,
      }
      byClerk.set(input.clerkUserId, rec)
      return rec
    },
    async linkAnonIdIfNull(accountId, anonId) {
      for (const rec of byClerk.values()) {
        if (rec.id === accountId) {
          // Mirror the real SQL's atomic null-predicate: only link when
          // currently null; report whether this call actually linked.
          if (rec.anonIdAtSignup !== null) return false
          byClerk.set(rec.clerkUserId, { ...rec, anonIdAtSignup: anonId })
          return true
        }
      }
      return false
    },
  }
  return { store, get: (id) => byClerk.get(id) ?? null }
}

let app: FastifyInstance | null = null

afterEach(async () => {
  if (app) {
    await app.close()
    app = null
  }
})

function inject(
  fastify: FastifyInstance,
  opts: { auth?: boolean; body?: unknown },
) {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (opts.auth) headers.authorization = 'Bearer good-token'
  return fastify.inject({
    method: 'POST',
    url: '/v1/account/link',
    headers,
    payload: JSON.stringify(opts.body ?? {}),
  })
}

describe('POST /v1/account/link', () => {
  it('401 when unauthenticated (requireAuth)', async () => {
    const { store } = makeFakeAccountStore()
    app = createApp({ posthog: null, clerk: verifier, accountStore: store, logLevel: 'silent' })
    const res = await inject(app, { auth: false, body: { anonId: ANON_A } })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('auth_required')
  })

  it('400 on a missing / empty anonId', async () => {
    const { store } = makeFakeAccountStore()
    app = createApp({ posthog: null, clerk: verifier, accountStore: store, logLevel: 'silent' })
    const missing = await inject(app, { auth: true, body: {} })
    expect(missing.statusCode).toBe(400)
    const empty = await inject(app, { auth: true, body: { anonId: '' } })
    expect(empty.statusCode).toBe(400)
  })

  it('accepts a non-UUID legacy/fallback-shaped anonId (min(1) contract, not uuid)', async () => {
    const fake = makeFakeAccountStore()
    app = createApp({ posthog: null, clerk: verifier, accountStore: fake.store, logLevel: 'silent' })
    const res = await inject(app, { auth: true, body: { anonId: 'fallback-abc-123' } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).linked).toBe(true)
    expect(fake.get(USER_ID)?.anonIdAtSignup).toBe('fallback-abc-123')
  })

  it('503 when no database is configured (store null)', async () => {
    app = createApp({ posthog: null, clerk: verifier, accountStore: null, logLevel: 'silent' })
    const res = await inject(app, { auth: true, body: { anonId: ANON_A } })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error).toBe('db_unavailable')
  })

  it('create+link: absent account → creates the row with the anonId (linked: true)', async () => {
    const fake = makeFakeAccountStore()
    app = createApp({ posthog: null, clerk: verifier, accountStore: fake.store, logLevel: 'silent' })
    const res = await inject(app, { auth: true, body: { anonId: ANON_A } })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.linked).toBe(true)
    expect(typeof body.accountId).toBe('string')
    expect(fake.get(USER_ID)?.anonIdAtSignup).toBe(ANON_A)
  })

  it('link-if-null: existing account with null anonId → sets it (linked: true)', async () => {
    const fake = makeFakeAccountStore([
      { id: 'acct_1', clerkUserId: USER_ID, anonIdAtSignup: null },
    ])
    app = createApp({ posthog: null, clerk: verifier, accountStore: fake.store, logLevel: 'silent' })
    const res = await inject(app, { auth: true, body: { anonId: ANON_A } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ accountId: 'acct_1', linked: true })
    expect(fake.get(USER_ID)?.anonIdAtSignup).toBe(ANON_A)
  })

  it('no-op-if-linked: existing non-null anonId is never overwritten (linked: false)', async () => {
    const fake = makeFakeAccountStore([
      { id: 'acct_1', clerkUserId: USER_ID, anonIdAtSignup: ANON_A },
    ])
    app = createApp({ posthog: null, clerk: verifier, accountStore: fake.store, logLevel: 'silent' })
    const res = await inject(app, { auth: true, body: { anonId: ANON_B } })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ accountId: 'acct_1', linked: false })
    // The original link is preserved — NOT overwritten by ANON_B.
    expect(fake.get(USER_ID)?.anonIdAtSignup).toBe(ANON_A)
  })

  it('linkAnonIdIfNull is atomic: a lost race returns false and never overwrites', async () => {
    // Simulates the concurrent case: the row was null at find-time but a
    // competing request set it before this update runs.
    const fake = makeFakeAccountStore([
      { id: 'acct_1', clerkUserId: USER_ID, anonIdAtSignup: ANON_A },
    ])
    const linked = await fake.store.linkAnonIdIfNull('acct_1', ANON_B)
    expect(linked).toBe(false)
    expect(fake.get(USER_ID)?.anonIdAtSignup).toBe(ANON_A)
  })

  it('concurrent first sign-ins: both 200 (never 500), exactly one links, no overwrite', async () => {
    const fake = makeFakeAccountStore()
    app = createApp({ posthog: null, clerk: verifier, accountStore: fake.store, logLevel: 'silent' })
    // Two near-simultaneous first-sign-in calls for the same brand-new Clerk
    // user, each carrying a different anonId. The ON CONFLICT create path
    // means one insert wins and the other falls back to re-read + no-op —
    // neither 500s on the unique constraint (Codex round 2).
    const [r1, r2] = await Promise.all([
      inject(app, { auth: true, body: { anonId: ANON_A } }),
      inject(app, { auth: true, body: { anonId: ANON_B } }),
    ])
    expect(r1.statusCode).toBe(200)
    expect(r2.statusCode).toBe(200)
    const b1 = JSON.parse(r1.body)
    const b2 = JSON.parse(r2.body)
    // Exactly one call created/linked; the other hit the conflict fallback.
    expect([b1.linked, b2.linked].sort()).toEqual([false, true])
    // Both reference the same account row.
    expect(b1.accountId).toBe(b2.accountId)
    // The winner's anonId is stored and never overwritten by the loser.
    const winnerAnon = b1.linked === true ? ANON_A : ANON_B
    expect(fake.get(USER_ID)?.anonIdAtSignup).toBe(winnerAnon)
  })

  it('maps a transient store failure to a retryable 503, not a 500', async () => {
    const throwingStore: AccountStore = {
      async findByClerkUserId() {
        throw new Error('db connection blip')
      },
      async createIfAbsent() {
        throw new Error('db connection blip')
      },
      async linkAnonIdIfNull() {
        throw new Error('db connection blip')
      },
    }
    app = createApp({
      posthog: null,
      clerk: verifier,
      accountStore: throwingStore,
      logLevel: 'silent',
    })
    const res = await inject(app, { auth: true, body: { anonId: ANON_A } })
    expect(res.statusCode).toBe(503)
    expect(JSON.parse(res.body).error).toBe('db_unavailable')
  })
})
