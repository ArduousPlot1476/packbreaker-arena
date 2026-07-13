// Clerk auth — token verification DI seam (M2 PR1).
//
// Mirrors posthog/client.ts: `ClerkVerifier` is the narrow interface the
// auth hook depends on — NOT @clerk/backend's full surface. A hand-rolled
// fake is injected in tests, so authed/anonymous shapes are unit-tested
// without real keys or network. createClerkVerifier returns `null` (and
// warns) when CLERK_SECRET_KEY is unset — every request then resolves to
// anonymous (userId null), which is why CI (no secrets) stays green.
//
// Identity model (Phase 1): anonymous-default / account-optional. This
// seam NEVER rejects a request — it resolves userId-or-null and leaves
// enforcement to each route (no route requires an account in PR1).
// telemetryAnonId remains the pre-account identity (linked, not replaced,
// at signup). @clerk/backend verifyToken is networkless-capable; here it
// uses the secret-key path (fetches + caches Clerk's JWKS on first use).

import { verifyToken } from '@clerk/backend'
import type { WarnLogger } from '../logging.js'

/** Per-request auth context. `userId` is the Clerk user id
 *  (JwtPayload.sub) when a valid bearer token is present, else `null`. */
export interface AuthContext {
  readonly userId: string | null
}

/** The subset of Clerk verification the auth hook depends on. Returns the
 *  verified user id, or `null` for a missing/invalid token. Never throws. */
export interface ClerkVerifier {
  verify(token: string): Promise<string | null>
}

/** Builds the verifier from resolved env. Returns `null` (and warns) when
 *  no secret key is configured → all requests resolve to anonymous. */
export function createClerkVerifier(
  opts: { secretKey: string | null },
  log: WarnLogger,
): ClerkVerifier | null {
  if (opts.secretKey === null) {
    log.warn(
      'CLERK_SECRET_KEY unset — auth is disabled; every request resolves to anonymous (userId null)',
    )
    return null
  }
  const secretKey = opts.secretKey
  return {
    async verify(token) {
      try {
        const result = await verifyToken(token, { secretKey })
        if (result.errors) return null
        // verifyToken's success `data` is loosely typed in this
        // @clerk/backend version; read the one claim we need (JWT `sub` =
        // the Clerk user id) through a minimal shape rather than coupling
        // to Clerk's exact payload union.
        const claims = result.data as { sub?: string } | undefined
        return claims?.sub ?? null
      } catch {
        // verifyToken returns { errors } for a bad token, but guard
        // against an unexpected throw (malformed input, network) — a
        // verification failure must resolve to anonymous, never crash.
        return null
      }
    },
  }
}

/** Resolves the auth context for a request from its Authorization header.
 *  Pure + verifier-injectable → unit-tested for both authed and anonymous
 *  shapes with no network. A missing header, non-Bearer scheme, absent
 *  verifier (key unset), or invalid token all resolve to anonymous. */
export async function resolveAuthContext(
  authorization: string | undefined,
  verifier: ClerkVerifier | null,
): Promise<AuthContext> {
  if (verifier === null) return { userId: null }
  const token = extractBearer(authorization)
  if (token === null) return { userId: null }
  return { userId: await verifier.verify(token) }
}

/** Extracts a Bearer token from an Authorization header, or null. */
function extractBearer(authorization: string | undefined): string | null {
  if (authorization === undefined) return null
  const match = /^Bearer (.+)$/.exec(authorization)
  return match ? match[1] : null
}
