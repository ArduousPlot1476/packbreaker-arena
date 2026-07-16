// @packbreaker/server — Fastify entrypoint (M1.5c PR 2 / CF 49).
//
// Thin bootstrap: read env → build the injectable seams (PostHog sink,
// DB client, Clerk verifier) → createApp → listen. This PR (M2 PR1) ships
// both § 6.1 endpoints — GET /v1/contract/daily and POST
// /v1/telemetry/batch — plus the DB (Neon/Drizzle) + auth (Clerk)
// scaffolding. Each seam is required-or-warn: unset env → null seam, and
// the server still boots (see env.ts).
//
// SIGTERM/SIGINT trigger app.close(), which fires the onClose hook
// (app.ts) to drain the PostHog buffer + DB pool before the process exits.

import pino from 'pino'
import { createApp } from './app.js'
import { createClerkVerifier } from './clerk/verifier.js'
import { createAccountStore } from './db/accountStore.js'
import { createDbClient } from './db/client.js'
import { createPlayerSaveStore } from './db/playerSaveStore.js'
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
  const db = createDbClient({ databaseUrl: env.databaseUrl }, bootLog)
  const clerk = createClerkVerifier({ secretKey: env.clerkSecretKey }, bootLog)
  // Account store for /v1/account/link — derived from the DB handle
  // (null when no DATABASE_URL → the route returns 503).
  const accountStore = db === null ? null : createAccountStore(db.db)
  // Player-save store for GET/PUT /v1/player/save — same null-or-real
  // derivation (null when no DATABASE_URL → the routes return 503).
  const playerSaveStore = db === null ? null : createPlayerSaveStore(db.db)

  const app = createApp({
    posthog,
    db,
    clerk,
    accountStore,
    playerSaveStore,
    logLevel: env.logLevel,
  })

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
