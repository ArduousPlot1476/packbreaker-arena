// emit.ts unit tests (M1.5c PR 1).
//
// Pattern parity with sim's telemetry-callback tests
// (packages/sim/test/run.test.ts:472-494): captured-array inversion
// through an injected transport, no network. Asserts enrichment shape,
// batch assembly, all three flush triggers, and throw-safety.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  ClassId,
  ContractId,
  RelicId,
  RunId,
  SimSeed,
  TelemetryBatchRequest,
  TelemetryEvent,
} from '@packbreaker/content';
import {
  createTelemetryClient,
  defaultFetchTransport,
  type FlushReason,
  type TelemetryTransport,
} from './emit';

const FIXED_NOW_MS = 1_700_000_000_000; // 2023-11-14T22:13:20.000Z
const FIXED_NOW_ISO = new Date(FIXED_NOW_MS).toISOString();

function makeRunStart(overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    tsClient: 'placeholder' as never,
    sessionId: 'placeholder-session',
    name: 'run_start',
    runId: 'run-test' as RunId,
    classId: 'tinker' as ClassId,
    contractId: 'neutral' as ContractId,
    seed: 42 as SimSeed,
    startingRelicId: 'apprentices-loop' as RelicId,
    ...overrides,
  } as TelemetryEvent;
}

interface CapturedSend {
  readonly batch: TelemetryBatchRequest;
  readonly reason: FlushReason;
}

function captureTransport() {
  const batches: TelemetryBatchRequest[] = [];
  const sends: CapturedSend[] = [];
  const transport: TelemetryTransport = {
    async send(batch, reason) {
      batches.push(batch);
      sends.push({ batch, reason });
    },
  };
  return { batches, sends, transport };
}

beforeEach(() => {
  // Pin the clock so enrichment is deterministic.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FIXED_NOW_MS));
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── Enrichment ──────────────────────────────────────────────────────

describe('emit.ts — enrichment', () => {
  it('re-stamps tsClient from injected clock + overrides sessionId on every captured event', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'tab-session-A',
      anonId: 'anon-A',
      clock: () => FIXED_NOW_MS,
      flushIntervalMs: 0, // disable interval timer
    });
    client.capture(makeRunStart()); // placeholder fields
    client.capture(makeRunStart({ runId: 'run-2' as RunId }));
    await client.flush();
    expect(batches).toHaveLength(1);
    const events = batches[0]!.events;
    expect(events).toHaveLength(2);
    for (const e of events) {
      expect(e.tsClient).toBe(FIXED_NOW_ISO);
      expect(e.sessionId).toBe('tab-session-A');
    }
    client.shutdown();
  });

  it('preserves variant-specific fields verbatim (only TelemetryBase fields are overridden)', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    await client.flush();
    const event = batches[0]!.events[0]!;
    if (event.name !== 'run_start') throw new Error('wrong variant');
    expect(event.runId).toBe('run-test');
    expect(event.classId).toBe('tinker');
    expect(event.contractId).toBe('neutral');
    expect(event.seed).toBe(42);
    expect(event.startingRelicId).toBe('apprentices-loop');
    client.shutdown();
  });
});

// ─── Batch assembly ──────────────────────────────────────────────────

describe('emit.ts — batch assembly', () => {
  it('assembles TelemetryBatchRequest with anonId + clientVersion + events array', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon-fixture-uuid',
      clientVersion: 'm1.5c-pr1-test',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    await client.flush();
    expect(batches[0]!.anonId).toBe('anon-fixture-uuid');
    expect(batches[0]!.clientVersion).toBe('m1.5c-pr1-test');
    expect(batches[0]!.events).toHaveLength(1);
    client.shutdown();
  });

  it('drains the buffer on flush (empty buffer post-flush)', async () => {
    const { transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    client.capture(makeRunStart());
    expect(client.bufferSize).toBe(2);
    await client.flush();
    expect(client.bufferSize).toBe(0);
    client.shutdown();
  });

  it('flush is a no-op on empty buffer (no transport call)', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    await client.flush();
    expect(batches).toHaveLength(0);
    client.shutdown();
  });
});

// ─── Flush trigger 1: interval ───────────────────────────────────────

describe('emit.ts — flush trigger 1: interval', () => {
  it('flushes pending events after flushIntervalMs', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 5_000,
    });
    client.capture(makeRunStart());
    expect(batches).toHaveLength(0);
    // Advance past the interval.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(batches).toHaveLength(1);
    expect(batches[0]!.events).toHaveLength(1);
    client.shutdown();
  });

  it('flushIntervalMs <= 0 disables the interval timer', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(batches).toHaveLength(0);
    client.shutdown();
  });
});

// ─── Flush trigger 2: document visibilitychange → hidden ─────────────

describe('emit.ts — flush trigger 2: visibilitychange → hidden', () => {
  it('flushes pending events when document.visibilityState becomes hidden', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    expect(batches).toHaveLength(0);
    // Simulate hidden tab.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    // Allow microtask flush.
    await vi.runOnlyPendingTimersAsync();
    expect(batches).toHaveLength(1);
    client.shutdown();
  });

  it('visibilitychange to "visible" does NOT flush', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.runOnlyPendingTimersAsync();
    expect(batches).toHaveLength(0);
    client.shutdown();
  });
});

// ─── Flush trigger 3: shutdown (explicit terminal drain) ─────────────

describe('emit.ts — flush trigger 3: shutdown', () => {
  it('shutdown flushes pending events + tears down timer + listener', async () => {
    const { batches, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 30_000,
    });
    client.capture(makeRunStart());
    client.shutdown();
    // shutdown's flush is fire-and-forget; let microtasks settle.
    await vi.runOnlyPendingTimersAsync();
    expect(batches).toHaveLength(1);
    // Timer torn down — additional capture after shutdown still buffers,
    // but no interval will fire to drain it.
    client.capture(makeRunStart());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(batches).toHaveLength(1); // unchanged
  });
});

// ─── Throw-safety (Catch 21 lineage) ─────────────────────────────────

describe('emit.ts — throw-safety on transport rejection', () => {
  it('swallows transport.send rejection; capture() does not throw', async () => {
    const transport: TelemetryTransport = {
      async send() {
        throw new Error('simulated network failure');
      },
    };
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    // flush() must not propagate the rejection.
    await expect(client.flush()).resolves.toBeUndefined();
    client.shutdown();
  });

  it('swallows transport.send synchronous throw', async () => {
    const transport: TelemetryTransport = {
      send() {
        throw new Error('sync throw from transport');
      },
    };
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    await expect(client.flush()).resolves.toBeUndefined();
    client.shutdown();
  });

  it('shutdown is throw-safe when transport rejects', async () => {
    const transport: TelemetryTransport = {
      async send() {
        throw new Error('transport down');
      },
    };
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    expect(() => client.shutdown()).not.toThrow();
    await vi.runOnlyPendingTimersAsync();
  });
});

// ────────────────────────────────────────────────────────────────────
// Phase 2.5 (5c PR 1 / Codex P1) — keepalive scoping + byte-size
// flush trigger. The transport now receives a FlushReason discriminator
// so it can adapt the request init; defaultFetchTransport sets
// keepalive ONLY when reason === 'pagehide'. The byte-size trigger
// fires a normal-fetch flush at 32 KiB so the page-dying batch can
// never exceed the 64 KiB keepalive cap.
// ────────────────────────────────────────────────────────────────────

describe('emit.ts — flush-reason discriminator (Phase 2.5 / Codex P1)', () => {
  it('interval flushes pass reason="interval" to transport.send', async () => {
    const { sends, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 5_000,
    });
    client.capture(makeRunStart());
    await vi.advanceTimersByTimeAsync(5_000);
    expect(sends).toHaveLength(1);
    expect(sends[0]!.reason).toBe('interval');
    client.shutdown();
    await vi.runOnlyPendingTimersAsync();
  });

  it('shutdown / external flush pass reason="terminal" to transport.send', async () => {
    const { sends, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    await client.flush(); // external flush → 'terminal'
    expect(sends).toHaveLength(1);
    expect(sends[0]!.reason).toBe('terminal');

    client.capture(makeRunStart());
    client.shutdown(); // shutdown → 'terminal'
    await vi.runOnlyPendingTimersAsync();
    expect(sends).toHaveLength(2);
    expect(sends[1]!.reason).toBe('terminal');
  });

  it('visibilitychange→hidden flushes pass reason="pagehide"', async () => {
    const { sends, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.runOnlyPendingTimersAsync();
    expect(sends).toHaveLength(1);
    expect(sends[0]!.reason).toBe('pagehide');
    client.shutdown();
    await vi.runOnlyPendingTimersAsync();
  });

  it('window pagehide event flushes pass reason="pagehide"', async () => {
    const { sends, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    client.capture(makeRunStart());
    window.dispatchEvent(new Event('pagehide'));
    await vi.runOnlyPendingTimersAsync();
    expect(sends).toHaveLength(1);
    expect(sends[0]!.reason).toBe('pagehide');
    client.shutdown();
    await vi.runOnlyPendingTimersAsync();
  });
});

describe('emit.ts — defaultFetchTransport keepalive scoping (Phase 2.5)', () => {
  it('sets keepalive:true ONLY when reason === "pagehide"; omits on interval + terminal', async () => {
    // Type the mock with the fetch signature so mock.calls indexes
    // into a [string|URL, RequestInit?] tuple rather than [].
    const fetchMock = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 204 }),
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
    try {
      const transport = defaultFetchTransport('/telemetry');
      const batch: TelemetryBatchRequest = {
        anonId: 'anon',
        clientVersion: 'test',
        events: [],
      };
      await transport.send(batch, 'pagehide');
      await transport.send(batch, 'interval');
      await transport.send(batch, 'terminal');
      expect(fetchMock).toHaveBeenCalledTimes(3);
      // Each call's second arg is the init object.
      const init0 = fetchMock.mock.calls[0]![1]!;
      const init1 = fetchMock.mock.calls[1]![1]!;
      const init2 = fetchMock.mock.calls[2]![1]!;
      expect(init0.keepalive).toBe(true); // pagehide
      // Interval + terminal: keepalive false (or absent — both
      // mean "no keepalive"). The implementation sets the field
      // explicitly so test it explicitly.
      expect(init1.keepalive).toBe(false);
      expect(init2.keepalive).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe('emit.ts — byte-size flush trigger (Phase 2.5)', () => {
  // A large event whose enriched form is ~600 bytes. Stack ~60 of
  // these to cross the 32 KiB threshold within a single test loop
  // (a bit over headroom to be sure stringify-overhead doesn't
  // undershoot).
  function makeBulkEvent(i: number): TelemetryEvent {
    const padding = 'x'.repeat(500); // ~500-char filler
    return {
      tsClient: 'placeholder' as never,
      sessionId: 'placeholder',
      name: 'tutorial_step_reached',
      stepId: `step-${i}-${padding}`,
    } as TelemetryEvent;
  }

  it('size-trigger fires a normal-fetch flush ("interval" reason) at threshold', async () => {
    const { sends, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0, // interval timer off so the only flush is the size-triggered one
    });
    // Push events until the 32 KiB threshold trips a synchronous
    // void-flush. Each event is ~600B enriched; 60+ events cross 32 KiB.
    for (let i = 0; i < 80; i += 1) {
      client.capture(makeBulkEvent(i));
    }
    // Allow the void-flush microtask + transport promise to settle.
    await vi.runOnlyPendingTimersAsync();
    expect(sends.length).toBeGreaterThanOrEqual(1);
    // Size-triggered flush is a LIVE-path event → 'interval' reason.
    expect(sends[0]!.reason).toBe('interval');
    client.shutdown();
    await vi.runOnlyPendingTimersAsync();
  });

  it('large-buffer regression: a subsequent pagehide flush carries a bounded batch (size-trigger drained the bulk first)', async () => {
    const { sends, transport } = captureTransport();
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    // Push bulk to trip the size trigger; size-flush ships normal-fetch.
    for (let i = 0; i < 80; i += 1) {
      client.capture(makeBulkEvent(i));
    }
    await vi.runOnlyPendingTimersAsync();
    const sizeFlushIndex = sends.length - 1;
    const sizeFlushBytes = JSON.stringify(sends[sizeFlushIndex]!.batch).length;
    // The pagehide flush after the size trigger should be bounded —
    // either empty (buffer was fully drained) or contain only what
    // was captured AFTER the size flush (which is nothing in this
    // test). Either way, under 64 KiB.
    window.dispatchEvent(new Event('pagehide'));
    await vi.runOnlyPendingTimersAsync();
    if (sends.length > sizeFlushIndex + 1) {
      const pagehideBatch = sends[sizeFlushIndex + 1]!;
      expect(pagehideBatch.reason).toBe('pagehide');
      const pagehideBytes = JSON.stringify(pagehideBatch.batch).length;
      expect(pagehideBytes).toBeLessThan(64 * 1024);
    }
    // The size-flush itself was also under the cap (32 KiB threshold
    // + at most one over-the-line event worth of bytes).
    expect(sizeFlushBytes).toBeLessThan(64 * 1024);
    client.shutdown();
    await vi.runOnlyPendingTimersAsync();
  });

  it('throw-safety preserved on size-trigger path: rejecting transport does not propagate', async () => {
    const transport: TelemetryTransport = {
      async send() {
        throw new Error('transport down');
      },
    };
    const client = createTelemetryClient({
      transport,
      sessionId: 'sess',
      anonId: 'anon',
      flushIntervalMs: 0,
    });
    // Bulk-push to trip the size trigger; rejection must not throw
    // out of capture().
    expect(() => {
      for (let i = 0; i < 80; i += 1) {
        client.capture(makeBulkEvent(i));
      }
    }).not.toThrow();
    await vi.runOnlyPendingTimersAsync();
    client.shutdown();
    await vi.runOnlyPendingTimersAsync();
  });
});
