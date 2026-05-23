// Fastify app factory (M1.5c PR 2 / CF 49).
//
// createApp is the testable seam: it builds + configures the Fastify
// instance but does NOT bind a port. Tests drive it via app.inject()
// (in-process, no network); index.ts calls .listen() for real serving.
//
// The telemetry sink is injected (DI seam) so tests pass a fake that
// records captures without hitting PostHog. A `null` sink means
// accept-but-no-forward (env-unset path, posthog/client.ts).
//
// onClose drains the sink's internal buffer (Rule 6 amendment lifetime
// walk — see posthog/client.ts): a graceful stop flushes in-flight
// events rather than dropping them at process exit.

import Fastify, { type FastifyInstance } from 'fastify'
import type { TelemetrySink } from './posthog/client.js'
import { registerTelemetryRoute } from './routes/telemetry.js'

/** Body cap for incoming batches. Comfortably exceeds the client's
 *  32 KiB byte-size flush threshold + envelope (emit.ts
 *  BYTE_SIZE_FLUSH_THRESHOLD); oversize requests get Fastify's built-in
 *  413 (FST_ERR_CTP_BODY_TOO_LARGE). */
const DEFAULT_BODY_LIMIT = 256 * 1024

export interface AppOptions {
  /** Telemetry forward target. `null` = accept batches, do not forward. */
  readonly posthog: TelemetrySink | null
  /** Pino level passed to Fastify's logger. Default: 'info'. */
  readonly logLevel?: string
  /** Override the incoming body cap (bytes). Default: 256 KiB. */
  readonly bodyLimit?: number
}

export function createApp(opts: AppOptions): FastifyInstance {
  const app = Fastify({
    logger: { level: opts.logLevel ?? 'info' },
    bodyLimit: opts.bodyLimit ?? DEFAULT_BODY_LIMIT,
  })

  registerTelemetryRoute(app, opts.posthog)

  // Drain the sink's buffer on graceful shutdown. Without this, events
  // queued inside posthog-node (per flushAt/flushInterval) are dropped
  // at process exit — the Catch 36 multi-lifetime mechanism.
  app.addHook('onClose', async () => {
    if (opts.posthog !== null) {
      await opts.posthog.shutdown()
    }
  })

  return app
}
