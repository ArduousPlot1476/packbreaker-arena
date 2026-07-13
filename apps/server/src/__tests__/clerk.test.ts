// Clerk auth seam — verifier factory + resolveAuthContext (M2 PR1).
//
// No real keys / network: a hand-rolled fake ClerkVerifier is injected,
// exercising both authed and anonymous request shapes. The "set key →
// non-null" factory test does NOT call verify() (which would reach
// @clerk/backend), mirroring env.test.ts's posthog non-null-sink test.

import { describe, expect, it } from 'vitest'
import {
  createClerkVerifier,
  resolveAuthContext,
  type ClerkVerifier,
} from '../clerk/verifier.js'

// 'good-token' → a user id; anything else → null (invalid).
const fakeVerifier: ClerkVerifier = {
  async verify(token) {
    return token === 'good-token' ? 'user_123' : null
  },
}

describe('resolveAuthContext', () => {
  it('authed: a valid Bearer token resolves to the userId', async () => {
    const auth = await resolveAuthContext('Bearer good-token', fakeVerifier)
    expect(auth.userId).toBe('user_123')
  })

  it('anonymous: a missing Authorization header resolves to null', async () => {
    const auth = await resolveAuthContext(undefined, fakeVerifier)
    expect(auth.userId).toBeNull()
  })

  it('anonymous: an invalid token resolves to null', async () => {
    const auth = await resolveAuthContext('Bearer nope', fakeVerifier)
    expect(auth.userId).toBeNull()
  })

  it('anonymous: a non-Bearer scheme resolves to null without calling verify', async () => {
    let called = false
    const spy: ClerkVerifier = {
      async verify() {
        called = true
        return 'user_x'
      },
    }
    const auth = await resolveAuthContext('Basic abc123', spy)
    expect(auth.userId).toBeNull()
    expect(called).toBe(false)
  })

  it('anonymous: an absent verifier (key unset) resolves to null', async () => {
    const auth = await resolveAuthContext('Bearer good-token', null)
    expect(auth.userId).toBeNull()
  })
})

describe('createClerkVerifier', () => {
  it('unset secret key → null verifier + one warn', () => {
    const warns: string[] = []
    const verifier = createClerkVerifier(
      { secretKey: null },
      { warn: (m) => warns.push(m) },
    )
    expect(verifier).toBeNull()
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('CLERK_SECRET_KEY')
  })

  it('set secret key → non-null verifier with a verify fn, no warn', () => {
    const warns: string[] = []
    const verifier = createClerkVerifier(
      { secretKey: 'sk_test_x' },
      { warn: (m) => warns.push(m) },
    )
    expect(verifier).not.toBeNull()
    expect(typeof verifier!.verify).toBe('function')
    expect(warns).toHaveLength(0)
  })
})
