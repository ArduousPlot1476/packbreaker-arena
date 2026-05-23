// PostHog sink construction + the DI seam (M1.5c PR 2 / CF 49).
//
// `TelemetrySink` is the narrow interface the route + forwarder depend
// on — NOT the full posthog-node surface. The real PostHog client
// satisfies it structurally; tests inject a fake that records captures
// without touching the network. createApp({ posthog }) takes a
// `TelemetrySink | null`; null means "accept batches, do not forward"
// (the env-unset path).
//
// Lifetime note (Rule 6 amendment — multi-lifetime container walk):
// the sink lives at PROCESS lifetime and buffers events internally
// (posthog-node batches per flushAt / flushInterval). Each captured
// event has its own EVENT-lifetime inside that buffer. The 204 the
// route returns acknowledges ENQUEUE, not delivery — events sit in the
// buffer until the SDK flushes. The onClose hook (app.ts) drains the
// buffer via shutdown() so a graceful stop does not silently drop the
// in-flight batch. A hard crash (SIGKILL/OOM) still loses the buffer —
// accepted loss for a graybox pipeline; M2 may add a durable queue
// (decision-log CF 49 / Catch 36 lineage).

import { PostHog } from 'posthog-node'

/** The subset of the PostHog client the server depends on. Keeping it
 *  narrow makes the test fake trivial and documents exactly which
 *  posthog-node surface we rely on. */
export interface TelemetrySink {
  capture(message: {
    distinctId: string
    event: string
    properties: Record<string, unknown>
    timestamp?: Date
  }): void
  /** Drains the internal buffer (final flush) before process exit. */
  shutdown(shutdownTimeoutMs?: number): Promise<void>
}

/** Minimal logger shape (Fastify's logger + pino both satisfy it). */
export interface WarnLogger {
  warn(msg: string): void
}

/** posthog-node batching policy. Lean on the SDK's own queue rather
 *  than reimplementing batching/retries server-side (CF 49 scope note:
 *  "retries / batching policy" = configure the SDK, not new logic). */
const FLUSH_AT = 20
const FLUSH_INTERVAL_MS = 10_000

/** Builds the telemetry sink from resolved env. Returns `null` (and
 *  warns) when no project key is configured — the server then accepts
 *  batches but forwards nothing. Never throws on construction. */
export function createPosthogSink(
  opts: { projectKey: string | null; host: string },
  log: WarnLogger,
): TelemetrySink | null {
  if (opts.projectKey === null) {
    log.warn(
      'POSTHOG_PROJECT_KEY unset — telemetry batches will be accepted (204) but NOT forwarded to PostHog',
    )
    return null
  }
  const client = new PostHog(opts.projectKey, {
    host: opts.host,
    flushAt: FLUSH_AT,
    flushInterval: FLUSH_INTERVAL_MS,
  })
  return client
}
