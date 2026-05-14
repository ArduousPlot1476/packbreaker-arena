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
//
// M1.5a PR 2 Phase 2b-2: active routing cutover. Existing state-
// preservation test math updated for derived.extraRerollsPerRound=1
// (Apprentice's Loop, default starter relic for Tinker). New tests
// cover useRun handler routing (onReroll α catch, onContinue
// enterCombatPhase, onCombatDone capture-delta + Bucket A dissolution
// via opponentClassId flowing through sync_from_sim).

import { describe, expect, it, vi } from 'vitest';
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

    // Initial state. With sim's createRun (M1.5a PR 2 Phase 2b-1+), the
    // run starts with Tinker + Apprentice's Loop (default starterRelicPool[0]),
    // which contributes extraRerollsPerRound: 1 to DerivedModifiers.
    // init_from_sim populates state.derived from sim's compose; gold = 4.
    const initialGold = parseInt(getByTestId('a-gold').textContent ?? '', 10);
    expect(initialGold).toBeGreaterThan(0);
    expect(getByTestId('a-reroll-count').textContent).toBe('0');

    // First reroll: cost = computeRerollCost(0, 1, 1, 1) = 0 (the free
    // reroll from Apprentice's Loop). Gold unchanged; rerollCount → 1.
    act(() => {
      fireEvent.click(getByTestId('a-reroll'));
    });
    expect(getByTestId('a-gold').textContent).toBe(String(initialGold));
    expect(getByTestId('a-reroll-count').textContent).toBe('1');

    // Swap children — analog of dispatcher swapping Desktop ↔ Mobile
    // on viewport crossing 768px. The provider above stays mounted,
    // so its useReducer state should survive.
    rerender(<Wrapper child="B" />);

    // The leaving child is unmounted; the new child mounts and reads
    // the preserved context value. rerollCount=1 proves state survived
    // the swap even though gold did not change on the first reroll.
    expect(queryByTestId('a')).toBeNull();
    expect(getByTestId('b-gold').textContent).toBe(String(initialGold));
    expect(getByTestId('b-reroll-count').textContent).toBe('1');

    // Second reroll: cost = computeRerollCost(1, 1, 1, 1) = 1 + (1-1)*1
    // = 1g. Gold decrements by 1; rerollCount → 2. This iteration
    // demonstrates state mutation persists across the swap.
    act(() => {
      fireEvent.click(getByTestId('b-reroll'));
    });
    expect(getByTestId('b-gold').textContent).toBe(String(initialGold - 1));
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

  it('init_from_sim populates top-level shop from sim snapshot', async () => {
    // Phase 2.5b — Codex P2 fix on PR #14. Pre-2.5b, RunProvider's init
    // left state.shop pointing at the client's module-import-time
    // generateInitialShop output (seeded by a different makeRunSeed()
    // call than sim's createRun seed). Post-2.5b, init_from_sim
    // overwrites state.shop with sim's authoritative shop.slots so
    // the visible shop matches sim's deterministic round-1 shop.
    //
    // Q-2.5b.1 adapter: client ShopSlot[] wraps each sim ItemId in
    // { uid, itemId }; the load-bearing assertion is the itemId list
    // matches sim's slots in order. uid construction detail is
    // covered by adapter shape (s${round}-${rerolls}-${i}); not
    // re-asserted here to avoid brittle coupling.
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    const simSlots = ctx.simRun!.getState().shop.slots;
    expect(ctx.state.shop.map((s) => s.itemId)).toEqual([...simSlots]);
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

  it('init_from_sim + sync_from_sim leave bag client-authoritative; sync_from_sim leaves shop client-authoritative (top-level fields, not nested in state.state)', () => {
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
    // Post-Phase-2.5b: init_from_sim bootstraps shop from sim's snapshot
    // (shape-adapted ItemId[] → ShopSlot[]). Coverage of that bootstrap
    // lives in the dedicated "init_from_sim populates top-level shop
    // from sim snapshot" test in the dynamic-import describe block.
    const afterSync = clientRunReducer(fixture, { type: 'sync_from_sim', snapshot });
    expect(afterSync.bag).toEqual(fixture.bag);
    expect(afterSync.shop).toEqual(fixture.shop);
  });
});

// ─── M1.5a PR 2 Phase 2b-2 — useRun handler routing tests ─────────────
//
// These tests render RunProvider with the real sim (no module mock),
// wait for the dynamic-import to resolve, then capture the context value
// and use vi.spyOn(simRun, '...') to inject failures or observe calls.
// This avoids the heavyweight vi.mock @packbreaker/sim setup while
// still verifying the active routing cutover end-to-end.

function CaptureContext({ onCtx }: { onCtx: (ctx: ReturnType<typeof useRunContext>) => void }) {
  const ctx = useRunContext();
  onCtx(ctx);
  return <div data-testid="capture-ready">ready</div>;
}

function CaptureWrapper({ onCtx }: { onCtx: (ctx: ReturnType<typeof useRunContext>) => void }) {
  return (
    <RunProvider>
      <CaptureContext onCtx={onCtx} />
    </RunProvider>
  );
}

async function renderAndCapture(): Promise<{
  getCtx: () => ReturnType<typeof useRunContext>;
}> {
  let latest: ReturnType<typeof useRunContext> | null = null;
  const onCtx = (c: ReturnType<typeof useRunContext>) => {
    latest = c;
  };
  render(<CaptureWrapper onCtx={onCtx} />);
  // RunProvider gates children on simRun !== null; onCtx fires only after
  // the dynamic-import resolves. Assert latest is populated AND its simRun
  // is non-null (the `not.toBeNull()` matcher distinguishes null but
  // accepts undefined — explicit truthiness check is required).
  await waitFor(() => {
    expect(latest).not.toBeNull();
    expect(latest!.simRun).not.toBeNull();
  });
  return { getCtx: () => latest! };
}

describe('useRun onReroll — sim mirror + α catch (M1.5a PR 2 Phase 2b-2)', () => {
  it('routes through simRun.rerollShop on success; dispatches sync_from_sim then reroll', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    expect(ctx.simRun).not.toBeNull();
    const rerollShopSpy = vi.spyOn(ctx.simRun!, 'rerollShop');
    const rerollCountBefore = ctx.state.state.rerollCount;
    act(() => {
      ctx.onReroll();
    });
    expect(rerollShopSpy).toHaveBeenCalledOnce();
    // The reducer's reroll dispatch fired — observable via rerollCount.
    await waitFor(() => {
      expect(getCtx().state.state.rerollCount).toBe(rerollCountBefore + 1);
    });
  });

  it('α catch — insufficient-gold throw is swallowed; reroll still dispatches', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    const rerollCountBefore = ctx.state.state.rerollCount;
    const goldBefore = ctx.state.state.gold;
    // Inject the specific α throw on rerollShop.
    vi.spyOn(ctx.simRun!, 'rerollShop').mockImplementation(() => {
      throw new Error('rerollShop: insufficient gold (have 0, need 1)');
    });
    // Suppress the warn that the catch logs.
    const originalWarn = console.warn;
    console.warn = vi.fn();
    try {
      // Must not throw — α catch swallows.
      expect(() => act(() => ctx.onReroll())).not.toThrow();
    } finally {
      console.warn = originalWarn;
    }
    // Client-side reducer still ran (rerollCount + gold mutated locally).
    await waitFor(() => {
      expect(getCtx().state.state.rerollCount).toBe(rerollCountBefore + 1);
    });
    // Gold decremented by the client-side reducer per its own cost calc
    // (free first reroll because derived.extraRerollsPerRound=1; goldBefore preserved).
    expect(getCtx().state.state.gold).toBe(goldBefore);
  });

  it('non-α errors from rerollShop re-propagate per Q5 (trust invariants)', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    vi.spyOn(ctx.simRun!, 'rerollShop').mockImplementation(() => {
      throw new Error('rerollShop: requires phase \'arranging\' (current: \'combat\')');
    });
    expect(() => act(() => ctx.onReroll())).toThrow(/requires phase 'arranging'/);
  });
});

describe('useRun onContinue — enterCombatPhase routing (M1.5a PR 2 Phase 2b-2)', () => {
  it('calls simRun.enterCombatPhase then dispatches continue_to_combat (combatActive=true)', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    expect(ctx.state.combatActive).toBe(false);
    const enterCombatPhaseSpy = vi.spyOn(ctx.simRun!, 'enterCombatPhase');
    act(() => {
      ctx.onContinue();
    });
    expect(enterCombatPhaseSpy).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(getCtx().state.combatActive).toBe(true);
    });
  });
});

describe('useRun onCombatDone — capture-delta routing + Bucket A dissolution (M1.5a PR 2 Phase 2b-2)', () => {
  it('routes through applyCombatOutcome + advancePhase; goldDelta computed from sim.gold before/after observation', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    // Transition sim to 'combat' phase first (handler precondition mirrors
    // the real onContinue → onCombatDone flow).
    act(() => ctx.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const applyOutcomeSpy = vi.spyOn(ctx.simRun!, 'applyCombatOutcome');
    const advancePhaseSpy = vi.spyOn(ctx.simRun!, 'advancePhase');

    const goldBefore = getCtx().state.state.gold;
    const roundBefore = getCtx().state.state.round;

    // Construct a CombatResult with player_win — sim's applyCombatOutcome
    // will credit winBonusGold + bonusGoldOnWin; advancePhase will then
    // credit baseIncomeForRound(2, DEFAULT_RULESET) = 4g.
    const playerWinResult = {
      events: [],
      outcome: 'player_win' as const,
      finalHp: { player: 30, ghost: 0 },
      endedAtTick: 5,
    };

    act(() => {
      ctx.onCombatDone({
        result: playerWinResult,
        opponentGhostId: null,
        opponentClassId: 'marauder' as ClassId,
        damageDealt: 30,
        damageTaken: 6,
      });
    });

    // Verify sim routing.
    expect(applyOutcomeSpy).toHaveBeenCalledOnce();
    expect(applyOutcomeSpy.mock.calls[0]![0]).toMatchObject({
      outcome: 'player_win',
      damageDealt: 30,
      damageTaken: 6,
      endedAtTick: 5,
      opponentGhostId: null,
      opponentClassId: 'marauder',
    });
    expect(advancePhaseSpy).toHaveBeenCalledOnce();
    // applyCombatOutcome must be called before advancePhase (order matters
    // for sim's phase guards). The order is implicit in spy call indices
    // when both are inspected via mock.invocationCallOrder.
    expect(applyOutcomeSpy.mock.invocationCallOrder[0]).toBeLessThan(
      advancePhaseSpy.mock.invocationCallOrder[0]!,
    );

    // Wait for the reducer dispatches to settle.
    await waitFor(() => {
      expect(getCtx().state.combatActive).toBe(false);
    });

    // sync_from_sim populated sim-authoritative fields. round advanced.
    expect(getCtx().state.state.round).toBe(roundBefore + 1);

    // Gold delta matches sim's actual mutation (winBonusGold=1 + bonusGoldOnWin=0
    // for Tinker + Apprentice's Loop + baseIncomeForRound(2)=4 → delta = 5).
    // Client.gold = goldBefore + 5.
    expect(getCtx().state.state.gold).toBe(goldBefore + 5);
  });

  it('Bucket A dissolution — history.opponentClassId populated from payload via sim sync (no hardcoded null)', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    act(() => ctx.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const lossResult = {
      events: [],
      outcome: 'ghost_win' as const,
      finalHp: { player: 0, ghost: 12 },
      endedAtTick: 3,
    };

    act(() => {
      ctx.onCombatDone({
        result: lossResult,
        opponentGhostId: null,
        opponentClassId: 'marauder' as ClassId,
        damageDealt: 18,
        damageTaken: 30,
      });
    });

    await waitFor(() => {
      expect(getCtx().state.combatActive).toBe(false);
    });

    // sync_from_sim populated history with the sim-authoritative entry,
    // which carries opponentClassId from applyCombatOutcome's Q7-tightened
    // input. The pre-Phase-2b-2 hardcoded null at the old combat_done
    // history-construction site is gone — proof of Bucket A dissolution.
    const history = getCtx().state.state.history;
    expect(history).toHaveLength(1);
    expect(history[0]!.opponentClassId).toBe('marauder');
    expect(history[0]!.outcome).toBe('loss');
  });
});
