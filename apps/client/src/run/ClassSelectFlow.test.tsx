// M1.5b PR 1 Implementation F.3 — class-select → init_from_sim flow
// integration smoke test.
//
// Distinct file from RunContext.test.tsx because that file vi.mocks
// ClassSelectScreen with a stub that auto-fires beginRun. This file
// uses the REAL ClassSelectScreen and drives it via @testing-library
// click events — exercising the same path a player takes from class-
// select to a running sim. vi.mock is file-scoped, so the two test
// suites can coexist without cross-contamination.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { RunProvider, useRunContext } from './RunContext';

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: () => void;
  removeEventListener: () => void;
  addListener: () => void;
  removeListener: () => void;
  dispatchEvent: () => boolean;
  onchange: null;
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(
      (query: string): FakeMediaQueryList => ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    ),
  );
}

function RunStateProbe({ testId }: { testId: string }) {
  const ctx = useRunContext();
  return (
    <div data-testid={testId}>
      <span data-testid={`${testId}-classid`}>{String(ctx.state.state.classId)}</span>
      <span data-testid={`${testId}-classname`}>{ctx.state.state.className}</span>
      <span data-testid={`${testId}-relic-starter`}>{String(ctx.state.state.relics.starter)}</span>
      <span data-testid={`${testId}-hearts`}>{ctx.state.state.hearts}</span>
      <span data-testid={`${testId}-maxhearts`}>{ctx.state.state.maxHearts}</span>
    </div>
  );
}

describe('RunProvider → ClassSelectScreen → init_from_sim flow (F.3)', () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it('Marauder + iron-will: class-select → beginRun → init_from_sim populates sim-authoritative state', async () => {
    const { getByTestId, queryByTestId } = render(
      <RunProvider>
        <RunStateProbe testId="probe" />
      </RunProvider>,
    );

    // RunProvider lazy-imports ClassSelectScreen — wait for the
    // dynamic-import to resolve before driving class-select clicks.
    // Cold-cache resolution under full-workspace concurrent runner can
    // straddle the default waitFor 1000ms ceiling; 2000ms buys headroom
    // without masking real regressions. Isolation runs land in <300ms.
    await waitFor(() => {
      expect(getByTestId('class-card-marauder')).toBeInTheDocument();
    }, { timeout: 2000 });
    expect(getByTestId('begin-run-cta')).toBeDisabled();

    // Pick Marauder → stage 2 with Marauder starter pool.
    fireEvent.click(getByTestId('class-card-marauder'));
    expect(getByTestId('relic-card-iron-will')).toBeInTheDocument();

    // Pick Iron Will → CTA enabled.
    fireEvent.click(getByTestId('relic-card-iron-will'));
    expect(getByTestId('begin-run-cta')).not.toBeDisabled();

    // Begin Run → pendingRunInput set, createRun dynamic-imports + runs,
    // RunBootFallback briefly visible, then init_from_sim populates state.
    fireEvent.click(getByTestId('begin-run-cta'));

    // Wait for the consumer to mount (post init_from_sim).
    await waitFor(() => {
      expect(queryByTestId('probe')).toBeInTheDocument();
    });

    // Sim-authoritative state lands per applySimSnapshot. Marauder +
    // iron-will: maxHearts === 4 (3 base + 1 bonus), className === 'Marauder',
    // relics.starter === 'iron-will'.
    expect(getByTestId('probe-classid').textContent).toBe('marauder');
    expect(getByTestId('probe-classname').textContent).toBe('Marauder');
    expect(getByTestId('probe-relic-starter').textContent).toBe('iron-will');
    expect(getByTestId('probe-maxhearts').textContent).toBe('4');
    expect(getByTestId('probe-hearts').textContent).toBe('4');
  });

  it('Tinker + apprentices-loop: same path, different payload, no class-select side-effects after beginRun', async () => {
    const { getByTestId, queryByTestId } = render(
      <RunProvider>
        <RunStateProbe testId="probe" />
      </RunProvider>,
    );

    await waitFor(() => {
      expect(getByTestId('class-card-tinker')).toBeInTheDocument();
    }, { timeout: 2000 });
    fireEvent.click(getByTestId('class-card-tinker'));
    fireEvent.click(getByTestId('relic-card-apprentices-loop'));
    fireEvent.click(getByTestId('begin-run-cta'));

    await waitFor(() => {
      expect(queryByTestId('probe')).toBeInTheDocument();
    });

    expect(getByTestId('probe-classid').textContent).toBe('tinker');
    expect(getByTestId('probe-classname').textContent).toBe('Tinker');
    expect(getByTestId('probe-relic-starter').textContent).toBe('apprentices-loop');
    // Tinker + apprentices-loop: no bonusHearts, so maxHearts stays at
    // DEFAULT_RULESET.startingHearts === 3.
    expect(getByTestId('probe-maxhearts').textContent).toBe('3');

    // Class-select affordances are unmounted (the RunProvider has swapped
    // to its consumer child); a stale click on the missing class card
    // can't accidentally re-fire beginRun.
    expect(queryByTestId('class-card-tinker')).toBeNull();
    expect(queryByTestId('class-card-marauder')).toBeNull();
  });
});
