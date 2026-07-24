// CF-87 route (D) regression guard — the client still creates runs under the
// 'neutral' contract.
//
// Route (D) sources the boss mutators from a ROUND-KEYED CONTRACTS lookup in
// opponentForRound; it deliberately does NOT swap createRun's contractId to
// 'forge-tyrant-boss' (the rejected Option A, which would collide with CF-68 and
// break run_start's contractId semantic — decision-log.md 2026-07-24 § "CF-87
// PHASE 1 RATIFIED …" § 5). This asserts run_start still emits contractId
// 'neutral' through the REAL client run-creation path (useRun → sim createRun →
// run_start via the capture seam), so a future accidental contract swap is caught.
//
// Strategy mirrors EntryModeTelemetry.test.tsx: partial-mock '../telemetry/emit'
// so `capture` is a spy, keep initTelemetry real, run the sim for real.

import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ClassId, RelicId, TelemetryEvent } from '@packbreaker/content';
import type * as EmitModule from '../telemetry/emit';
import { RunProvider, useRunContext } from './RunContext';

vi.mock('../telemetry/emit', async (importOriginal) => {
  const actual = await importOriginal<typeof EmitModule>();
  return { ...actual, capture: vi.fn() };
});

vi.mock('../screens/ClassSelectScreen', () => ({
  ClassSelectScreen: function StubClassSelectScreen({
    onConfirm,
  }: {
    onConfirm: (input: { classId: ClassId; startingRelicId: RelicId }) => void;
  }) {
    useEffect(() => {
      onConfirm({
        classId: 'marauder' as ClassId,
        startingRelicId: 'razors-edge' as RelicId,
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

describe('CF-87 route (D) — run creation stays on the neutral contract', () => {
  beforeEach(() => {
    latestCtx = null;
    localStorage.clear();
    stubMatchMedia();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('run_start still emits contractId "neutral" (no boss-contract swap)', async () => {
    const emit = await import('../telemetry/emit');
    const captureSpy = vi.mocked(emit.capture);

    render(
      <RunProvider>
        <CtxProbe />
      </RunProvider>,
    );

    await waitFor(() => {
      expect(latestCtx).not.toBeNull();
      expect(latestCtx!.simRun).not.toBeNull();
    });

    const runStarts = captureSpy.mock.calls
      .map((c) => c[0] as TelemetryEvent)
      .filter((e): e is RunStartEvent => e.name === 'run_start');

    expect(runStarts.length).toBeGreaterThanOrEqual(1);
    expect(runStarts.every((e) => e.contractId === 'neutral')).toBe(true);
  });
});
