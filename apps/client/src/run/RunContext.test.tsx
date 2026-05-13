// Regression test for the M1.3.3 commit-10 Codex P1 fix.
//
// The bug: prior to lifting useRun into <RunProvider>, both
// DesktopRunScreen and MobileRunScreen called useRun() independently.
// When the viewport crossed 768px (rotation, window resize), the
// dispatcher unmounted one orchestrator and mounted the other —
// destroying the leaving orchestrator's useReducer state. Bag, shop,
// gold, hearts, round all reset on viewport switch.
//
// The fix: <RunProvider> owns useRun() and stays mounted across the
// dispatcher's child swap. Both orchestrators consume via
// useRunContext().
//
// This test asserts the architectural property directly: state
// changes made via useRunContext persist when the provider's child
// subtree is swapped (the unit-test analog of a viewport-driven
// orchestrator swap).
//
// M1.5a PR 2 Phase 2b-1: RunProvider now dynamic-imports the sim
// RunController on mount and renders RunBootFallback until simRun
// resolves. Existing tests await the resolve; new tests cover
// init_from_sim / sync_from_sim reducer cases (Q2 Amendment A
// bifurcated gold authority).

import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type {
  ClassId,
  ContractId,
  DerivedModifiers,
  IsoTimestamp,
  RelicSlots,
  RoundNumber,
  RunId,
  RunOutcome,
  RunState as SimRunState,
  SimSeed,
} from '@packbreaker/content';
import { DEFAULT_RULESET } from '@packbreaker/content';
import { RunProvider, useRunContext } from './RunContext';
import { clientRunReducer, INITIAL_CLIENT_STATE } from './RunController';

function GoldDisplay({ testId }: { testId: string }) {
  const { state, onReroll } = useRunContext();
  return (
    <div data-testid={testId}>
      <span data-testid={`${testId}-gold`}>{state.state.gold}</span>
      <span data-testid={`${testId}-reroll-count`}>{state.state.rerollCount}</span>
      <button data-testid={`${testId}-reroll`} type="button" onClick={onReroll}>
        reroll
      </button>
    </div>
  );
}

function Wrapper({ child }: { child: 'A' | 'B' }) {
  return (
    <RunProvider>
      {child === 'A' ? <GoldDisplay testId="a" /> : <GoldDisplay testId="b" />}
    </RunProvider>
  );
}

/** Minimal SimRunState fixture for reducer init/sync tests. Branded
 *  fields constructed via type-cast (test scope only). */
function makeSimSnapshot(overrides: Partial<SimRunState> = {}): SimRunState {
  return {
    runId: 'test-run-id' as RunId,
    seed: 99999 as SimSeed,
    classId: 'tinker' as ClassId,
    contractId: 'neutral' as ContractId,
    ruleset: DEFAULT_RULESET,
    derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
    startedAt: '2025-01-01T00:00:00.000Z' as IsoTimestamp,
    hearts: 3,
    gold: 4,
    currentRound: 1 as RoundNumber,
    bag: { dimensions: { width: 6, height: 4 }, placements: [] },
    relics: { starter: null, mid: null, boss: null },
    shop: { slots: [], purchased: [], rerollsThisRound: 0 },
    trophiesAtStart: 0,
    history: [],
    outcome: 'in_progress',
    ...overrides,
  };
}

describe('RunProvider — state preservation across child swap (Codex P1 regression)', () => {
  it('preserves state when the provider child subtree swaps', async () => {
    const { rerender, getByTestId, queryByTestId } = render(<Wrapper child="A" />);

    // M1.5a PR 2 Phase 2b-1: RunProvider initially renders
    // RunBootFallback while sim's createRun resolves via dynamic-
    // import. Wait for the fallback to disappear and the consumer
    // tree to mount before asserting state.
    await waitFor(() => {
      expect(queryByTestId('run-boot-fallback')).toBeNull();
    });

    // Initial state — gold = DEFAULT_RULESET.baseGoldPerRound (4 in M1.3.4a's
    // round-1 fresh-start; was 8 pre-M1.3.4a when SEED_BAG/SEED_SHOP seeded
    // a mid-run mock at round 4). rerollCount starts at 0.
    const initialGold = parseInt(getByTestId('a-gold').textContent ?? '', 10);
    expect(initialGold).toBeGreaterThan(0);
    expect(getByTestId('a-reroll-count').textContent).toBe('0');

    // Mutate state via reroll: cost = computeRerollCost(0, 1, 1, 0) = 1
    // (default ruleset: rerollCostStart=1, rerollCostIncrement=1,
    // EXTRA_REROLLS_PER_ROUND=0), so gold decrements by 1 and
    // rerollCount increments to 1.
    act(() => {
      fireEvent.click(getByTestId('a-reroll'));
    });
    const goldAfterFirstReroll = initialGold - 1;
    expect(getByTestId('a-gold').textContent).toBe(String(goldAfterFirstReroll));
    expect(getByTestId('a-reroll-count').textContent).toBe('1');

    // Swap children — analog of dispatcher swapping Desktop ↔ Mobile
    // on viewport crossing 768px. The provider above stays mounted,
    // so its useReducer state should survive.
    rerender(<Wrapper child="B" />);

    // The leaving child is unmounted; the new child mounts and reads
    // the preserved context value.
    expect(queryByTestId('a')).toBeNull();
    expect(getByTestId('b-gold').textContent).toBe(String(goldAfterFirstReroll));
    expect(getByTestId('b-reroll-count').textContent).toBe('1');

    // Mutate again from the new child — the same reducer instance
    // continues to advance the state. Second reroll cost = 2, so gold
    // decrements by 2.
    act(() => {
      fireEvent.click(getByTestId('b-reroll'));
    });
    expect(getByTestId('b-gold').textContent).toBe(String(goldAfterFirstReroll - 2));
    expect(getByTestId('b-reroll-count').textContent).toBe('2');
  });

  it('throws a clear error when useRunContext is called outside <RunProvider>', () => {
    function OrphanConsumer() {
      useRunContext();
      return null;
    }
    // Suppress React's expected-error console output for this throw.
    const originalError = console.error;
    console.error = () => {};
    try {
      expect(() => render(<OrphanConsumer />)).toThrow(
        'useRunContext must be called inside <RunProvider>',
      );
    } finally {
      console.error = originalError;
    }
  });
});

describe('RunProvider — RunBootFallback + dynamic-import (M1.5a PR 2 Phase 2b-1)', () => {
  it('renders RunBootFallback initially while simRun is null', () => {
    const { getByTestId, queryByTestId } = render(
      <Wrapper child="A" />,
    );
    // Synchronously after render, the dynamic-import of sim has been
    // scheduled but the promise has not resolved — the provider value
    // has simRun: null and renders the fallback.
    expect(getByTestId('run-boot-fallback')).toBeInTheDocument();
    expect(queryByTestId('a')).toBeNull();
  });

  it('replaces RunBootFallback with the context children after dynamic-import resolves', async () => {
    const { getByTestId, queryByTestId } = render(<Wrapper child="A" />);
    expect(getByTestId('run-boot-fallback')).toBeInTheDocument();
    // After the microtask flush, simRun is non-null and the provider
    // renders its children with init_from_sim-populated state.
    await waitFor(() => {
      expect(queryByTestId('run-boot-fallback')).toBeNull();
    });
    expect(getByTestId('a')).toBeInTheDocument();
  });
});

describe('clientRunReducer — init_from_sim + sync_from_sim (Q2 Amendment A)', () => {
  it('init_from_sim populates all 6 sim-derived fields on ClientRunState.state', () => {
    const snapshot = makeSimSnapshot({
      runId: 'init-test-run' as RunId,
      classId: 'marauder' as ClassId,
      contractId: 'neutral' as ContractId,
      derived: { extraRerollsPerRound: 1, itemCostDelta: -1, bonusGoldOnWin: 2 },
      relics: { starter: 'apprentices-loop', mid: null, boss: null } as RelicSlots,
      outcome: 'in_progress',
    });
    const next = clientRunReducer(INITIAL_CLIENT_STATE, {
      type: 'init_from_sim',
      snapshot,
    });
    expect(next.state.runId).toBe('init-test-run');
    expect(next.state.classId).toBe('marauder');
    expect(next.state.contractId).toBe('neutral');
    expect(next.state.derived).toEqual({
      extraRerollsPerRound: 1,
      itemCostDelta: -1,
      bonusGoldOnWin: 2,
    } satisfies DerivedModifiers);
    expect(next.state.relics).toEqual({
      starter: 'apprentices-loop',
      mid: null,
      boss: null,
    });
    expect(next.state.outcome).toBe('in_progress');
  });

  it('init_from_sim OVERWRITES gold (run-start; sim and client have not yet diverged)', () => {
    const snapshot = makeSimSnapshot({ gold: 42 });
    const fixture = {
      ...INITIAL_CLIENT_STATE,
      state: { ...INITIAL_CLIENT_STATE.state, gold: 99 },
    };
    const next = clientRunReducer(fixture, { type: 'init_from_sim', snapshot });
    expect(next.state.gold).toBe(42);
  });

  it('sync_from_sim IGNORES gold (Q2 Amendment A — client-authoritative gold for M1.5a)', () => {
    const snapshot = makeSimSnapshot({ gold: 42 });
    const fixture = {
      ...INITIAL_CLIENT_STATE,
      state: { ...INITIAL_CLIENT_STATE.state, gold: 99 },
    };
    const next = clientRunReducer(fixture, { type: 'sync_from_sim', snapshot });
    // Client's pre-sync gold preserved; sim's gold value discarded.
    expect(next.state.gold).toBe(99);
    // Other sim-authoritative fields still applied.
    expect(next.state.runId).toBe(snapshot.runId);
    expect(next.state.hearts).toBe(snapshot.hearts);
  });

  it('sync_from_sim still applies all non-gold sim-authoritative fields', () => {
    const snapshot = makeSimSnapshot({
      hearts: 1,
      currentRound: 7 as RoundNumber,
      trophiesAtStart: 50,
      outcome: 'eliminated' as RunOutcome,
    });
    const next = clientRunReducer(INITIAL_CLIENT_STATE, {
      type: 'sync_from_sim',
      snapshot,
    });
    expect(next.state.hearts).toBe(1);
    expect(next.state.round).toBe(7);
    expect(next.state.trophy).toBe(50);
    expect(next.state.outcome).toBe('eliminated');
  });

  it('init_from_sim + sync_from_sim leave bag and shop client-authoritative (top-level fields, not nested in state.state)', () => {
    const snapshot = makeSimSnapshot();
    const fixture = {
      ...INITIAL_CLIENT_STATE,
      bag: [
        { uid: 'b1', itemId: 'iron-sword' as never, col: 0, row: 0, rot: 0 },
      ],
      shop: [{ uid: 's1', itemId: 'apple' as never }],
    };
    const afterInit = clientRunReducer(fixture, { type: 'init_from_sim', snapshot });
    expect(afterInit.bag).toEqual(fixture.bag);
    expect(afterInit.shop).toEqual(fixture.shop);
    const afterSync = clientRunReducer(fixture, { type: 'sync_from_sim', snapshot });
    expect(afterSync.bag).toEqual(fixture.bag);
    expect(afterSync.shop).toEqual(fixture.shop);
  });
});
