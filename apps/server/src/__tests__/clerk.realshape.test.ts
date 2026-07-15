// Rule 4 antidote — the REAL @clerk/backend boundary, UNMOCKED (M2.1 hotfix).
//
// CF-70 survived 6 Codex rounds AND full unit coverage because every test at
// this boundary injected a fake/mocked verifier: the code's ASSUMED return
// shape was never once checked against the library's ACTUAL one. A mocked
// boundary can only ever confirm the assumption it was built from.
//
// This test therefore imports the REAL top-level verifyToken and pins the
// contract verify() depends on: the wrapped export THROWS on an invalid token —
// it does NOT resolve a `{ errors }` object. If a future @clerk/backend bump
// flips back to the unwrapped `{ data, errors }` union, this fails loudly
// instead of silently 401ing every authenticated request.
//
// Hermetic + CI-safe: a malformed token fails at decode, before any secret-key
// use or JWKS network call — no real credentials, no network.

import { verifyToken } from '@clerk/backend'
import { describe, expect, it } from 'vitest'
import { createClerkVerifier } from '../clerk/verifier.js'

const MALFORMED = 'not.a.valid.jwt'

describe('real @clerk/backend contract (unmocked)', () => {
  it('the top-level verifyToken export THROWS on an invalid token — it does not resolve { errors }', async () => {
    await expect(
      verifyToken(MALFORMED, { secretKey: 'sk_test_dummy' }),
    ).rejects.toThrow()
  })

  it('verify() resolves to null when the real verifyToken throws', async () => {
    const verifier = createClerkVerifier(
      { secretKey: 'sk_test_dummy' },
      { warn: () => {} },
    )
    expect(verifier).not.toBeNull()
    expect(await verifier!.verify(MALFORMED)).toBeNull()
  })
})
