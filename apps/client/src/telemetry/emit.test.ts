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
import { createTelemetryClient, type TelemetryTransport } from './emit';

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

function captureTransport() {
  const batches: TelemetryBatchRequest[] = [];
  const transport: TelemetryTransport = {
    async send(batch) {
      batches.push(batch);
    },
  };
  return { batches, transport };
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
