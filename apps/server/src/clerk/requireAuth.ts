// requireAuth — per-route enforcing preHandler (M2.1 PR2.5).
//
// Reusable guard for routes that require an authenticated account. The
// global onRequest hook (clerk/middleware.ts) has already populated
// request.auth (userId | null) for every request; this preHandler simply
// rejects with 401 when there is no user. Enforcement stays PER-ROUTE
// (attach via route options `{ preHandler: requireAuth }`) — the global
// hook remains non-enforcing, so anonymous requests to other routes are
// unaffected.

import type { FastifyReply, FastifyRequest } from 'fastify'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (request.auth.userId === null) {
    // Sending a reply from a preHandler short-circuits the lifecycle —
    // the route handler does not run.
    return reply.status(401).send({ error: 'auth_required' })
  }
}
