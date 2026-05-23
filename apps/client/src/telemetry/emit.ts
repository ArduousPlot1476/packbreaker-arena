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

/** Half the browser-spec 64 KiB Fetch `keepalive` body cap. The size-
 *  triggered flush fires when the buffered batch crosses this
 *  threshold so the next page-dying flush (visibilitychange→hidden /
 *  pagehide) is guaranteed to carry < 64 KiB even after additional
 *  captures slip in between the threshold-cross and the actual flush
 *  microtask. Best-effort: a single in-flight event >32 KiB still
 *  ships under the cap on its own (graybox events are sub-1 KiB so
 *  this is theoretical), and bursts that pile multiple events between
 *  threshold-cross and flush-execution will still bound at the next
 *  cycle. Phase 2.5 (5c PR 1 / Codex P1). */
const BYTE_SIZE_FLUSH_THRESHOLD = 32 * 1024;

/** Discriminator for which path triggered a flush. Only 'pagehide'
 *  flushes carry `keepalive:true`; interval + terminal flushes use a
 *  normal fetch. The transport observes the reason so it can adapt
 *  the request init (or — in tests — record it). */
export type FlushReason = 'interval' | 'terminal' | 'pagehide';

export interface TelemetryTransport {
  send(batch: TelemetryBatchRequest, reason: FlushReason): Promise<void>;
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
    async send(batch, reason) {
      try {
        // keepalive ONLY on the page-dying path (visibilitychange→
        // hidden + pagehide both arrive here as reason='pagehide').
        // Interval + terminal flushes use a normal fetch — they fire
        // while the page is alive, so the request lifetime is bound
        // by the live JS context, NOT the post-unload keepalive
        // window. Avoiding keepalive on the live paths sidesteps the
        // browser-spec 64 KiB keepalive body cap (Phase 2.5 / Codex
        // P1: large/bursty batches were hitting the cap on every
        // path and being silently dropped by the throw-safe swallow
        // below). The byte-size flush trigger
        // (BYTE_SIZE_FLUSH_THRESHOLD) caps the page-dying batch
        // under the 64 KiB limit.
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
          keepalive: reason === 'pagehide',
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
  // Approximate serialized byte size of the buffer, summed from
  // JSON.stringify lengths at capture time. Conservative under-
  // estimate of the wire size (omits batch envelope overhead — anonId,
  // clientVersion, JSON array framing — which together are <200B for
  // graybox event counts). The byte-size flush trigger reads this to
  // decide when to fire a normal-fetch flush so the page-dying batch
  // stays bounded under the keepalive cap.
  let bufferBytes = 0;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let visibilityListener: (() => void) | null = null;
  let pagehideListener: (() => void) | null = null;

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
    const enriched = enrich(event);
    buffer.push(enriched);
    // Track approximate serialized size for the byte-size flush
    // trigger. Add a small per-event constant (~2 chars for the
    // array-element comma + spacing) so the running total tracks the
    // eventual stringified batch within a tight bound.
    try {
      bufferBytes += JSON.stringify(enriched).length + 2;
    } catch {
      // Defensive: if stringify ever throws (circular ref via custom
      // payload, etc.), skip size accounting for this event. The
      // event still buffers; size trigger may under-count by one
      // event's worth, but interval+terminal flushes still drain.
    }
    if (bufferBytes >= BYTE_SIZE_FLUSH_THRESHOLD) {
      // Live-path proactive flush — normal fetch, NOT keepalive. This
      // is the size-bound that keeps any subsequent page-dying flush
      // under the 64 KiB keepalive cap.
      void flush('interval');
    }
  }

  async function flush(reason: FlushReason): Promise<void> {
    if (buffer.length === 0) return;
    const events = buffer.splice(0, buffer.length);
    bufferBytes = 0;
    const batch: TelemetryBatchRequest = {
      anonId,
      clientVersion,
      events,
    };
    try {
      await transport.send(batch, reason);
    } catch {
      // Defense-in-depth — defaultFetchTransport already swallows fetch
      // errors internally; this catches anything else (custom transport
      // throwing, stringify on circular refs, etc.). Events lost.
    }
  }

  // Flush trigger 1: interval cadence. flushIntervalMs <= 0 disables
  // the timer (tests use 0 to inspect buffer state without timer
  // interference). reason='interval' → normal fetch (no keepalive).
  if (typeof setInterval !== 'undefined' && flushInterval > 0) {
    intervalTimer = setInterval(() => {
      void flush('interval');
    }, flushInterval);
  }

  // Flush trigger 2a: document visibilitychange → hidden.
  // Flush trigger 2b: window pagehide.
  // Both map to reason='pagehide' so defaultFetchTransport ships with
  // keepalive:true (the only path that needs to survive page unload).
  // Pagehide is a more reliable signal on some browsers/platforms
  // (Safari tab close, mobile background → hidden); visibilitychange
  // catches the common desktop tab-switch case. Either listener firing
  // is OK — the second one will see an empty buffer and no-op.
  if (typeof document !== 'undefined') {
    visibilityListener = () => {
      if (document.visibilityState === 'hidden') {
        void flush('pagehide');
      }
    };
    document.addEventListener('visibilitychange', visibilityListener);
  }
  if (typeof window !== 'undefined') {
    pagehideListener = () => {
      void flush('pagehide');
    };
    window.addEventListener('pagehide', pagehideListener);
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
    if (pagehideListener !== null && typeof window !== 'undefined') {
      window.removeEventListener('pagehide', pagehideListener);
      pagehideListener = null;
    }
    // Flush trigger 3 (implicit via shutdown): drain pending events.
    // reason='terminal' → normal fetch (no keepalive). Shutdown runs
    // while the page is still alive (caller-initiated teardown).
    void flush('terminal');
  }

  return {
    capture,
    /** External flush — caller-initiated drain. Treated as terminal
     *  (normal fetch, no keepalive) since the call site is in live JS
     *  context. */
    flush: () => flush('terminal'),
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
