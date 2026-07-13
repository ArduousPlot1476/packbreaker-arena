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
import { registerClerkAuth } from './clerk/middleware.js'
import type { ClerkVerifier } from './clerk/verifier.js'
import type { AccountStore } from './db/accountStore.js'
import type { DbClient } from './db/client.js'
import type { TelemetrySink } from './posthog/client.js'
import { registerAccountLinkRoute } from './routes/account.js'
import { registerDailyContractRoute } from './routes/contract.js'
import { registerTelemetryRoute } from './routes/telemetry.js'

/** Body cap for incoming batches. Comfortably exceeds the client's
 *  32 KiB byte-size flush threshold + envelope (emit.ts
 *  BYTE_SIZE_FLUSH_THRESHOLD); oversize requests get Fastify's built-in
 *  413 (FST_ERR_CTP_BODY_TOO_LARGE). */
const DEFAULT_BODY_LIMIT = 256 * 1024

export interface AppOptions {
  /** Telemetry forward target. `null` = accept batches, do not forward. */
  readonly posthog: TelemetrySink | null
  /** Database client. `null`/omitted = no DB (DB-backed features degrade).
   *  Optional so existing callers/tests need not thread a DB. */
  readonly db?: DbClient | null
  /** Clerk token verifier. `null`/omitted = auth disabled → every request
   *  resolves to anonymous. Optional for the same reason as `db`. */
  readonly clerk?: ClerkVerifier | null
  /** Account persistence for /v1/account/link. `null`/omitted = no DB
   *  (route returns 503). Injected directly so tests fake it without a
   *  live drizzle handle. Derived from `db` in index.ts. */
  readonly accountStore?: AccountStore | null
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

  // Non-enforcing auth: resolves request.auth (userId | null) for every
  // request; enforcement is per-route (none require an account in PR1).
  registerClerkAuth(app, opts.clerk ?? null)

  registerDailyContractRoute(app)
  registerTelemetryRoute(app, opts.posthog)
  registerAccountLinkRoute(app, opts.accountStore ?? null)

  // Drain per-dependency buffers/pools on graceful shutdown. Without the
  // posthog drain, events queued inside posthog-node (per flushAt/
  // flushInterval) are dropped at process exit — the Catch 36
  // multi-lifetime mechanism; the DB pool is drained the same way.
  app.addHook('onClose', async () => {
    if (opts.posthog !== null) {
      await opts.posthog.shutdown()
    }
    if (opts.db) {
      await opts.db.close()
    }
  })

  return app
}
