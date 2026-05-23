// POST /v1/telemetry/batch (M1.5c PR 2 / CF 49).
//
// Status map:
//   204 — batch accepted (events enqueued to the sink, or accepted-but-
//         not-forwarded when the sink is null / env-unset).
//   400 — Zod validation failure (malformed/unknown variant, missing
//         anonId, empty events, …) OR malformed JSON (Fastify built-in).
//   413 — body exceeds bodyLimit (Fastify built-in, app.ts config).
//   500 — unexpected forward exception (logged; should not happen —
//         capture() enqueues synchronously).
//
// Client contract (emit.ts:117-127): POST, Content-Type application/
// json, body = TelemetryBatchRequest, errors swallowed client-side. The
// route requires NO header the client doesn't send.

import type { FastifyInstance } from 'fastify'
import type { TelemetrySink } from '../posthog/client.js'
import { forwardBatch } from '../posthog/forward.js'
import { parseTelemetryBatch } from '../validation/telemetryBatch.js'

export function registerTelemetryRoute(
  app: FastifyInstance,
  sink: TelemetrySink | null,
): void {
  app.post('/v1/telemetry/batch', async (request, reply) => {
    const parsed = parseTelemetryBatch(request.body)
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: 'invalid_batch', issues: parsed.error.issues })
    }

    // Env-unset (sink === null): accept the batch (204) but forward
    // nothing. Mirrors the client's throw-safe posture and lets the
    // server run before PostHog is provisioned.
    if (sink !== null) {
      try {
        forwardBatch(sink, parsed.data)
      } catch (err) {
        // capture() enqueues synchronously and should not throw; if it
        // does, log + 500 rather than crash. The client swallows the
        // response either way, so this never reaches the user.
        request.log.error({ err }, 'telemetry forward failed')
        return reply.status(500).send({ error: 'forward_failed' })
      }
    }

    return reply.status(204).send()
  })
}
