// Clerk auth hook — populates request.auth (M2 PR1).
//
// Registered globally on the app but NON-ENFORCING: it resolves
// userId-or-null for every request and never rejects. Auth is optional
// per-route — a route that requires an account checks request.auth.userId
// itself (no such route in PR1). Uses onRequest (the earliest lifecycle
// hook) so auth is resolved before any route-level preHandler/handler.

import type { FastifyInstance } from 'fastify'
import {
  resolveAuthContext,
  type AuthContext,
  type ClerkVerifier,
} from './verifier.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Resolved auth context. Always set by the global onRequest hook
     *  (userId is null for anonymous requests). */
    auth: AuthContext
  }
}

/** Registers the non-enforcing auth hook. `verifier` is null when Clerk
 *  is unconfigured → every request resolves to anonymous. */
export function registerClerkAuth(
  app: FastifyInstance,
  verifier: ClerkVerifier | null,
): void {
  // Default decoration keeps the property present even if a hook were to
  // bail early; the onRequest hook reassigns a fresh context per request
  // (no cross-request sharing — the default is a primitive).
  app.decorateRequest('auth', null)
  app.addHook('onRequest', async (request) => {
    request.auth = await resolveAuthContext(
      request.headers.authorization,
      verifier,
    )
  })
}
