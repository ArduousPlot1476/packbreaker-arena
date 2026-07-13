// POST /v1/account/link (M2.1 PR2.5).
//
// Creates the accounts row on first sign-in and one-time-links the device
// telemetryAnonId. Enforced via requireAuth (the account is identified by
// the authenticated Clerk userId, NOT the body). Mirrors the CF-49 route
// shape: inline handler + standalone Zod module + null-or-real DI seam.
//
// Status map:
//   200 — { accountId, linked } (linked=true if THIS call created or
//         first-linked the row; false if it was already linked = no-op).
//   400 — Zod body failure (missing / non-uuid anonId).
//   401 — no authenticated user (requireAuth preHandler).
//   503 — no database configured (store null; env-unset path).
//
// Idempotency (never overwrite an existing link):
//   absent            → create with anon_id_at_signup = anonId   (linked: true)
//   present, null     → set  anon_id_at_signup = anonId          (linked: true)
//   present, non-null → no-op                                    (linked: false)

import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../clerk/requireAuth.js'
import type { AccountStore } from '../db/accountStore.js'
import { parseAccountLink } from '../validation/accountLink.js'

export function registerAccountLinkRoute(
  app: FastifyInstance,
  store: AccountStore | null,
): void {
  app.post(
    '/v1/account/link',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = parseAccountLink(request.body)
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'invalid_body', issues: parsed.error.issues })
      }
      if (store === null) {
        return reply.status(503).send({ error: 'db_unavailable' })
      }

      // requireAuth guarantees a user; re-read for type-narrowing.
      const userId = request.auth.userId
      if (userId === null) {
        return reply.status(401).send({ error: 'auth_required' })
      }
      const { anonId } = parsed.data

      const existing = await store.findByClerkUserId(userId)
      if (existing === null) {
        const created = await store.create({
          clerkUserId: userId,
          anonIdAtSignup: anonId,
        })
        return reply.status(200).send({ accountId: created.id, linked: true })
      }
      if (existing.anonIdAtSignup === null) {
        // Atomic link-if-null: `linked` is false if a concurrent request set
        // it first (never overwrite), true if THIS call performed the link.
        const linked = await store.linkAnonIdIfNull(existing.id, anonId)
        return reply.status(200).send({ accountId: existing.id, linked })
      }
      // Already linked — never overwrite.
      return reply.status(200).send({ accountId: existing.id, linked: false })
    },
  )
}
