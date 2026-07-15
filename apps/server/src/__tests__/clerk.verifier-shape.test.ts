// CF-70 antidote — verify() against verifyToken's REAL resolved shape (M2.1 hotfix).
//
// The pre-fix verify() read `result.errors` / `result.data.sub`, treating the
// top-level `verifyToken` export as the internal `{ data, errors }` union. That
// export is withLegacyReturn-wrapped and RESOLVES the JwtPayload directly, so
// `.data` was always undefined → verify() returned null for EVERY valid token →
// requireAuth 401'd every enforced route (POST /v1/account/link).
//
// This test mocks verifyToken to resolve a realistic JwtPayload — mirroring the
// wrapped export's contract — and asserts the sub comes back. It FAILS on the
// pre-fix code (which returns null).
//
// Sibling: clerk.realshape.test.ts pins the same boundary against the REAL,
// unmocked library, so an ASSUMED shape can never again pass a mocked boundary.

import { describe, expect, it, vi } from 'vitest'
import { createClerkVerifier } from '../clerk/verifier.js'

// Mirrors the real withLegacyReturn-wrapped export: resolves the payload
// directly (sub at the top level) — NOT a { data, errors } wrapper.
vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async () => ({
    sub: 'user_123',
    iss: 'https://example.clerk.accounts.dev',
    exp: 9999999999,
  })),
}))

describe('createClerkVerifier.verify — resolved JwtPayload shape (CF-70)', () => {
  it('returns the sub from the payload verifyToken resolves', async () => {
    const verifier = createClerkVerifier(
      { secretKey: 'sk_test_x' },
      { warn: () => {} },
    )
    expect(verifier).not.toBeNull()
    expect(await verifier!.verify('any-token')).toBe('user_123')
  })
})
