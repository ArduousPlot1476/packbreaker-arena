// Batch → PostHog capture mapping (M1.5c PR 2 / CF 49).
//
// Per-event mapping (telemetry-plan.md § 8 + CF 49 spec):
//   distinctId ← batch.anonId          (cross-session device id)
//   event      ← event.name            (the discriminator)
//   properties ← (event minus name) + clientVersion + tsServer
//   timestamp  ← event.tsClient        (client-side event time)
//
// tsServer is the server-side ingest time (telemetry-plan.md § 8:
// "Server adds tsServer on ingest"). tsClient stays in properties for
// replay ordering; tsServer is added for cross-session analytics.
//
// posthog-node enqueues synchronously and flushes on its own schedule
// (flushAt / flushInterval, posthog/client.ts). capture() does not
// round-trip the network here — the 204 the route returns acknowledges
// ENQUEUE, not delivery (Rule 6 lifetime walk; onClose drains the
// buffer on graceful stop).

import type { TelemetrySink } from './client.js'
import type { ParsedTelemetryBatch } from '../validation/telemetryBatch.js'

/** Forwards every event in a validated batch to the sink. `now` is
 *  injectable so tests can assert a deterministic tsServer. */
export function forwardBatch(
  sink: TelemetrySink,
  batch: ParsedTelemetryBatch,
  now: () => Date = () => new Date(),
): void {
  const tsServer = now().toISOString()
  for (const event of batch.events) {
    const { name, ...rest } = event
    sink.capture({
      distinctId: batch.anonId,
      event: name,
      properties: {
        ...rest,
        clientVersion: batch.clientVersion,
        tsServer,
      },
      timestamp: new Date(event.tsClient),
    })
  }
}
