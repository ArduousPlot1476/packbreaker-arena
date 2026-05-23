// M1.5c PR 1 — telemetry emit chokepoint.
//
// Per tech-architecture.md § 12 (L350): "All events flow through
// apps/client/src/telemetry/emit.ts. Never call PostHog directly from
// feature code." This module is the single seam between sim/client
// emit sites and the server-mediated transport (POST /v1/telemetry/
// batch → server forwards to PostHog, per L353).
//
// Invariant (Pattern #7 lineage — OUT-only): emit.ts imports types
// from @packbreaker/content only. NO sim imports; NO data flow back
// into sim state. Telemetry is fire-and-forget; transport failure is
// swallowed (Catch 21 throw-safety) — telemetry must never crash the
// app or affect gameplay state.
//
// Architecture:
//   - `createTelemetryClient(opts)` factory returns an isolated client
//     instance (used by tests with an injected capturing transport).
//   - `initTelemetry(opts)` / `capture(event)` is the module-level
//     singleton wrapping useRun's call sites (one telemetry client per
//     tab; initialized after class-select commits with the resolved
//     sessionId + anonId).
//   - Enrichment: each captured event has tsClient re-stamped from the
//     wall clock (sim emits with this.startedAt as a sentinel; client
//     stamps the actual event time at capture) and sessionId overridden
//     with the client-tier value (sim and client wire the same value
//     so the override is a no-op for sim events).
//   - Buffer + batched flush on three triggers:
//       (1) interval (DEFAULT_FLUSH_INTERVAL_MS, 30s)
//       (2) document visibilitychange → hidden (best-effort send before
//           tab close; default fetch transport uses keepalive)
//       (3) explicit flush() (callers can force send before a known
//           terminal transition; today useRun does not, but the surface
//           supports it for future M1.5c PR 2 wiring)
//   - Transport injection: tests pass a capturing transport; production
//     uses defaultFetchTransport() (POST /v1/telemetry/batch).
//
// CF 35 closure surface (the abandon emit + 2 sim-callback stubs in
// useRun all funnel through capture()). PR 2 lands the server-side
// /v1/telemetry/batch endpoint + PostHog forward.

import type {
  IsoTimestamp,
  TelemetryBatchRequest,
  TelemetryEvent,
} from '@packbreaker/content';

const DEFAULT_BATCH_URL = '/v1/telemetry/batch';
const DEFAULT_FLUSH_INTERVAL_MS = 30_000;
const CLIENT_VERSION = 'm1.5c-pr1';

export interface TelemetryTransport {
  send(batch: TelemetryBatchRequest): Promise<void>;
}

export interface TelemetryClient {
  capture(event: TelemetryEvent): void;
  flush(): Promise<void>;
  shutdown(): void;
  /** Read-only buffer length — test-only introspection. */
  readonly bufferSize: number;
}

export interface CreateTelemetryOptions {
  readonly transport: TelemetryTransport;
  /** Per-tab session identifier (uuid v4). Generated/persisted by
   *  identifiers.ts#getOrCreateSessionId at useRun mount. */
  readonly sessionId: string;
  /** Cross-session device anonId (uuid v4). Resolved from
   *  LocalSaveV1.telemetryAnonId or freshly generated at useRun mount. */
  readonly anonId: string;
  /** Clock injection for tests. Default: Date.now. */
  readonly clock?: () => number;
  /** Interval flush cadence in ms. Default: 30s. Pass 0 to disable
   *  interval flushing (tests). */
  readonly flushIntervalMs?: number;
  /** Client version string for TelemetryBatchRequest.clientVersion.
   *  Default: 'm1.5c-pr1'. */
  readonly clientVersion?: string;
}

export function defaultFetchTransport(
  url: string = DEFAULT_BATCH_URL,
): TelemetryTransport {
  return {
    async send(batch) {
      try {
        // keepalive lets the request finish even if the tab is being
        // closed — pairs with the visibilitychange→hidden flush trigger.
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
          keepalive: true,
        });
      } catch {
        // Swallow per Catch 21 lineage — telemetry transport failure
        // must never propagate to the app. Events on this batch are
        // lost (acceptable for a graybox pipeline).
      }
    },
  };
}

export function createTelemetryClient(
  opts: CreateTelemetryOptions,
): TelemetryClient {
  const transport = opts.transport;
  const clock = opts.clock ?? (() => Date.now());
  const flushInterval = opts.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
  const clientVersion = opts.clientVersion ?? CLIENT_VERSION;
  const { sessionId, anonId } = opts;

  const buffer: TelemetryEvent[] = [];
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let visibilityListener: (() => void) | null = null;

  function enrich(event: TelemetryEvent): TelemetryEvent {
    // Spread first so the explicit fields below win — sim events
    // already carry tsClient/sessionId (from CreateRunInput defaults
    // + this.startedAt + this.sessionId), but we re-stamp to the
    // actual event time and override sessionId with the client-tier
    // value. Both are TelemetryBase fields applied to every variant.
    return {
      ...event,
      tsClient: new Date(clock()).toISOString() as IsoTimestamp,
      sessionId,
    };
  }

  function capture(event: TelemetryEvent): void {
    buffer.push(enrich(event));
  }

  async function flush(): Promise<void> {
    if (buffer.length === 0) return;
    const events = buffer.splice(0, buffer.length);
    const batch: TelemetryBatchRequest = {
      anonId,
      clientVersion,
      events,
    };
    try {
      await transport.send(batch);
    } catch {
      // Defense-in-depth — defaultFetchTransport already swallows fetch
      // errors internally; this catches anything else (custom transport
      // throwing, stringify on circular refs, etc.). Events lost.
    }
  }

  // Flush trigger 1: interval cadence. flushIntervalMs <= 0 disables
  // the timer (tests use 0 to inspect buffer state without timer
  // interference).
  if (typeof setInterval !== 'undefined' && flushInterval > 0) {
    intervalTimer = setInterval(() => {
      void flush();
    }, flushInterval);
  }

  // Flush trigger 2: document visibilitychange → hidden. Best-effort
  // send before tab close. defaultFetchTransport uses keepalive so the
  // request survives the unload.
  if (typeof document !== 'undefined') {
    visibilityListener = () => {
      if (document.visibilityState === 'hidden') {
        void flush();
      }
    };
    document.addEventListener('visibilitychange', visibilityListener);
  }

  function shutdown(): void {
    if (intervalTimer !== null) {
      clearInterval(intervalTimer);
      intervalTimer = null;
    }
    if (visibilityListener !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', visibilityListener);
      visibilityListener = null;
    }
    // Flush trigger 3 (implicit via shutdown): drain pending events.
    void flush();
  }

  return {
    capture,
    flush,
    shutdown,
    get bufferSize() {
      return buffer.length;
    },
  };
}

// ─── Module-level singleton (production wiring) ──────────────────────

let _client: TelemetryClient | null = null;

/** Initialize the production telemetry singleton. Idempotent —
 *  subsequent calls return the already-initialized client without
 *  re-running setup. Called by useRun's mount-once effect. */
export function initTelemetry(opts: CreateTelemetryOptions): TelemetryClient {
  if (_client !== null) return _client;
  _client = createTelemetryClient(opts);
  return _client;
}

/** Module-level capture entrypoint. No-op when the singleton hasn't
 *  been initialized yet (e.g., emit fires from a code path before
 *  useRun mounts; events are dropped silently rather than buffered
 *  globally to keep the model simple). */
export function capture(event: TelemetryEvent): void {
  if (_client === null) return;
  _client.capture(event);
}

/** Force a flush of the singleton. Returns immediately if uninitialized. */
export function flushTelemetry(): Promise<void> {
  if (_client === null) return Promise.resolve();
  return _client.flush();
}

/** Test helper. Resets the module singleton + tears down its timers/
 *  listeners. Never call in production. */
export function __resetTelemetryForTests(): void {
  if (_client !== null) {
    _client.shutdown();
    _client = null;
  }
}
