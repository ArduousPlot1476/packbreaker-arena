// CF 55 (M1.5d PR 2) — entry-mode telemetry, both client entry paths.
//
// Asserts that the run_start telemetry emitted by the REAL sim carries the
// entryMode stamped by the entry path that seeded the run:
//   - fresh class-select (beginRun)            → 'class_select'
//   - Play Again same class (replaySameClass)  → 'replay_same_class'
//
// Strategy: partial-mock '../telemetry/emit' so `capture` is a spy (the seam
// useRun wires as the sim's onTelemetryEvent), keeping initTelemetry +
// defaultFetchTransport real. The sim runs for real, so run_start is genuinely
// emitted with the threaded entryMode — no sim mock, no network. The two paths
// diverge at their setPendingRunInput but converge at one createRun call, so
// this exercises the path-dependent stamping that distinguishes CF 55 from the
// CF 41 startingRelicId precedent (which was path-invariant).
//
// Distinct file from RunContext.test.tsx: that file relies on the REAL emit
// singleton for its anonId-persistence assertions, and vi.mock is file-scoped.

import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { ClassId, RelicId, TelemetryEvent } from '@packbreaker/content';
import type * as EmitModule from '../telemetry/emit';
import { RunProvider, useRunContext } from './RunContext';

// Partial mock: capture is a spy; everything else (initTelemetry,
// defaultFetchTransport) stays real so useRun's telemetry init still works.
vi.mock('../telemetry/emit', async (importOriginal) => {
  const actual = await importOriginal<typeof EmitModule>();
  return { ...actual, capture: vi.fn() };
});

// Stub ClassSelectScreen to auto-fire the fresh path on mount (tinker +
// apprentices-loop), mirroring RunContext.test.tsx. onConfirm carries no
// entryMode — beginRun stamps 'class_select'.
vi.mock('../screens/ClassSelectScreen', () => ({
  ClassSelectScreen: function StubClassSelectScreen({
    onConfirm,
  }: {
    onConfirm: (input: { classId: ClassId; startingRelicId: RelicId }) => void;
  }) {
    useEffect(() => {
      onConfirm({
        classId: 'tinker' as ClassId,
        startingRelicId: 'apprentices-loop' as RelicId,
      });
    }, [onConfirm]);
    return null;
  },
}));

type RunStartEvent = Extract<TelemetryEvent, { name: 'run_start' }>;

function stubMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    })),
  );
}

let latestCtx: ReturnType<typeof useRunContext> | null = null;
function CtxProbe() {
  latestCtx = useRunContext();
  return null;
}

describe('CF 55 — run_start entryMode by entry path', () => {
  beforeEach(() => {
    latestCtx = null;
    localStorage.clear(); // ensure fresh class-select (no restore-on-mount)
    stubMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('stamps class_select on the fresh path and replay_same_class on Play Again', async () => {
    const emit = await import('../telemetry/emit');
    const captureSpy = vi.mocked(emit.capture);
    const runStarts = () =>
      captureSpy.mock.calls
        .map((c) => c[0] as TelemetryEvent)
        .filter((e): e is RunStartEvent => e.name === 'run_start');

    render(
      <RunProvider>
        <CtxProbe />
      </RunProvider>,
    );

    // Fresh path: stub ClassSelectScreen auto-fires beginRun → sim createRun
    // → run_start emitted through the capture spy.
    await waitFor(() => {
      expect(latestCtx).not.toBeNull();
      expect(latestCtx!.simRun).not.toBeNull();
    });
    const fresh = runStarts();
    expect(fresh.length).toBeGreaterThanOrEqual(1);
    expect(fresh.every((e) => e.entryMode === 'class_select')).toBe(true);

    // Replay path: relics.starter is set post-mount, so replaySameClass can
    // fire directly (no need to reach run-end). It clears local, resets, and
    // re-seeds pendingRunInput with entryMode:'replay_same_class' → a second
    // createRun → a second run_start.
    act(() => {
      latestCtx!.replaySameClass();
    });
    await waitFor(() => {
      expect(runStarts().some((e) => e.entryMode === 'replay_same_class')).toBe(true);
    });

    // The most recent run_start is the replay; exactly one replay run_start,
    // and every run_start before it was class_select.
    const all = runStarts();
    expect(all.at(-1)!.entryMode).toBe('replay_same_class');
    expect(all.filter((e) => e.entryMode === 'replay_same_class')).toHaveLength(1);
  });
});
