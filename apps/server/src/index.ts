// @packbreaker/server — Fastify entrypoint (M1.5c PR 2 / CF 49).
//
// Thin bootstrap: read env → build the PostHog sink → createApp →
// listen. Two endpoints are planned per tech-architecture.md § 6.1
// (GET /v1/contract/daily lands later); this PR ships POST
// /v1/telemetry/batch (server half of the telemetry pipeline).
//
// SIGTERM/SIGINT trigger app.close(), which fires the onClose hook
// (app.ts) to drain the PostHog buffer before the process exits.

import pino from 'pino'
import { createApp } from './app.js'
import { readEnv } from './env.js'
import { createPosthogSink } from './posthog/client.js'

async function main(): Promise<void> {
  const env = readEnv()

  // Bootstrap logger for sink construction (the env-unset warn fires
  // before the Fastify instance — and its logger — exist).
  const bootLog = pino({ level: env.logLevel })
  const posthog = createPosthogSink(
    { projectKey: env.posthogProjectKey, host: env.posthogHost },
    bootLog,
  )

  const app = createApp({ posthog, logLevel: env.logLevel })

  // Graceful shutdown: close the app (fires onClose → posthog.shutdown)
  // then exit. Guard against double-invocation if both signals arrive.
  let closing = false
  const shutdown = (signal: NodeJS.Signals): void => {
    if (closing) return
    closing = true
    app.log.info({ signal }, 'shutting down')
    app
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        app.log.error({ err }, 'error during shutdown')
        process.exit(1)
      })
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)

  await app.listen({ port: env.port, host: '0.0.0.0' })
}

main().catch((err) => {
  // Boot failure (port in use, etc.) — log via a fresh pino since the
  // app may not exist yet, then exit non-zero.
  pino().error({ err }, 'server failed to start')
  process.exit(1)
})
