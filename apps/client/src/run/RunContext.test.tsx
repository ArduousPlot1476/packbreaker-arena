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

import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type {
  ClassId,
  ContractId,
  DerivedModifiers,
  IsoTimestamp,
  RelicId,
  RelicSlots,
  RoundNumber,
  RunHistoryEntry,
  RunId,
  RunOutcome,
  RunState as SimRunState,
  SimSeed,
} from '@packbreaker/content';
import { DEFAULT_RULESET } from '@packbreaker/content';
import { RunProvider, useRunContext } from './RunContext';
import { clientRunReducer, INITIAL_CLIENT_STATE } from './RunController';
import { SHOP_POOL_ITEMS } from './content';

// M1.5b PR 1 Implementation C+B: RunProvider now mounts ClassSelectScreen
// when pendingRunInput is null. Existing tests in this file expect a
// pre-gate world where createRun fired on mount. Stub ClassSelectScreen
// with a component that auto-fires beginRun (tinker + apprentices-loop)
// on its first effect — preserves the old "auto-create-run-on-mount"
// semantics for everything except the dedicated class-select-flow tests
// (which live in ClassSelectFlow.test.tsx and don't apply this mock).
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

describe('RunProvider — RunBootFallback + dynamic-import (M1.5a PR 2 Phase 2b-1; M1.5b PR 1 class-select gate)', () => {
  it('renders RunBootFallback after stub-ClassSelectScreen fires beginRun (before sim resolves)', async () => {
    // M1.5b PR 1: ClassSelectScreen is stub-mocked at the top of this
    // file to auto-fire beginRun on its first effect with tinker +
    // apprentices-loop. After render() returns (act flushes effects),
    // pendingRunInput is non-null + simRun is still null → RunProvider
    // renders RunBootFallback. The dynamic-import microtask hasn't
    // resolved yet, so consumer children are not mounted.
    const { getByTestId, queryByTestId } = render(<Wrapper child="A" />);
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

  it('init_from_sim populates shop only with SHOP_POOL_ITEMS members (Phase 2.5f Codex Finding 3 fix)', async () => {
    // Pre-2.5f, useRun's createRun call omitted itemsRegistry; sim
    // fell back to canonical 45-item ITEMS and emitted non-iconned
    // itemIds (wooden-club, hand-axe, iron-mace, etc.) into shop.slots.
    // Post-2.5f, createRun receives `itemsRegistry: SHOP_POOL_ITEMS`,
    // constraining sim's internal makeShop pool to the 12 iconned IDs.
    // Asserted on both surfaces — sim's authoritative slots AND the
    // client's adapted shop — so a future refactor that decouples
    // client.shop from sim.shop.slots cannot regress either side.
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    const simSlots = ctx.simRun!.getState().shop.slots;
    expect(simSlots.every((id) => id in SHOP_POOL_ITEMS)).toBe(true);
    expect(
      ctx.state.shop.every((s) => s.itemId !== null && s.itemId in SHOP_POOL_ITEMS),
    ).toBe(true);
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
    const trophyBefore = INITIAL_CLIENT_STATE.state.trophy;
    const next = clientRunReducer(INITIAL_CLIENT_STATE, {
      type: 'sync_from_sim',
      snapshot,
    });
    expect(next.state.hearts).toBe(1);
    expect(next.state.round).toBe(7);
    // Phase 2.5h: trophy is locked client-authoritative for M1.5a per
    // decision-log.md 2026-05-11 § M1.5a Phase 1 design take-2
    // ratification §6e Q13. sync_from_sim no longer writes trophy from
    // snapshot.trophiesAtStart — client trophy preserved across sync.
    expect(next.state.trophy).toBe(trophyBefore);
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

describe('useRun onCombatDone — trophy client-authoritative accumulation (M1.5a PR 2 Phase 2.5h Codex Finding 4 restore)', () => {
  // Phase 2.5g audit (TROPHY-SHAPED-LOCKED for `trophy`) confirmed sim
  // never mutates trophiesAtStart — getState returns hardcoded 0 at
  // sim state.ts:336 with // M2 concern. comment. PR 2 Phase 2b-2's
  // combat_done collapse delegated trophy to sync_from_sim's overwrite
  // path (snapshot.trophiesAtStart === 0 always), dropping the pre-PR-2
  // +18-per-win accumulator and producing the TopBar trophy-stuck-at-zero
  // gap Codex flagged as Finding 4. Phase 2.5h restores client-side
  // accumulation per decision-log.md 2026-05-11 § M1.5a Phase 1 design
  // take-2 ratification §6e Q13 ("client-owned trophy for 5a").

  it('win path increments trophy by +18 (M0-placeholder per M1.3.4a ratification 5)', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    act(() => ctx.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const trophyBefore = getCtx().state.state.trophy;
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
    await waitFor(() => expect(getCtx().state.combatActive).toBe(false));
    expect(getCtx().state.state.trophy).toBe(trophyBefore + 18);
  });

  it('loss path leaves trophy unchanged', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    act(() => ctx.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const trophyBefore = getCtx().state.state.trophy;
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
    await waitFor(() => expect(getCtx().state.combatActive).toBe(false));
    expect(getCtx().state.state.trophy).toBe(trophyBefore);
  });

  it('three consecutive wins accumulate +54 trophy (confirms sync_from_sim does not clobber accumulator between dispatches)', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx = getCtx();
    const trophyBefore = getCtx().state.state.trophy;
    const playerWinResult = {
      events: [],
      outcome: 'player_win' as const,
      finalHp: { player: 30, ghost: 0 },
      endedAtTick: 5,
    };
    for (let i = 0; i < 3; i++) {
      act(() => ctx.onContinue());
      await waitFor(() => expect(getCtx().state.combatActive).toBe(true));
      act(() => {
        ctx.onCombatDone({
          result: playerWinResult,
          opponentGhostId: null,
          opponentClassId: 'marauder' as ClassId,
          damageDealt: 30,
          damageTaken: 0,
        });
      });
      await waitFor(() => expect(getCtx().state.combatActive).toBe(false));
    }
    expect(getCtx().state.state.trophy).toBe(trophyBefore + 54);
  });
});

// ─── M1.5a PR 2 Phase 2.5d — terminal-outcome handler no-op guards ────
//
// Codex re-review on baafab6 surfaced a P1 crash: onContinue calls
// simRun.enterCombatPhase() unconditionally, but enterCombatPhase
// throws when sim phase != 'arranging' (Q1). After advancePhase's
// endRun path, phase = 'ended' and outcome ∈ {'won', 'eliminated',
// 'abandoned'} → handler throws → React error boundary catches →
// user-visible crash. Phase 2.5c audit confirmed onReroll has the
// same arranging-only phase guard (re-propagated by α; second P1
// path); onCombatDone is transitively unreachable from terminal
// state but receives a defense-in-depth guard.
//
// Drive mechanism: render real sim, enter combat phase, mock the
// next CombatDone's sim mutations + getState to forge a snapshot
// whose `outcome` is the target terminal literal; trigger
// onCombatDone so the sync_from_sim dispatch flips client state to
// terminal. Restore mocks before the per-test assertion spy so spy
// call counts reflect only post-drive activity.

describe('useRun handlers — terminal-outcome no-op guards (M1.5a PR 2 Phase 2.5d)', () => {
  async function setupTerminalState(
    outcome: 'won' | 'eliminated' | 'abandoned',
  ): Promise<() => ReturnType<typeof useRunContext>> {
    const { getCtx } = await renderAndCapture();
    const ctx0 = getCtx();
    // Enter combat so applyCombatOutcome's phase guard would normally
    // pass — mocks below short-circuit before that check fires.
    act(() => ctx0.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const baseSnapshot = ctx0.simRun!.getState();
    vi.spyOn(ctx0.simRun!, 'applyCombatOutcome').mockImplementation(() => {});
    vi.spyOn(ctx0.simRun!, 'advancePhase').mockImplementation(() => {});
    vi.spyOn(ctx0.simRun!, 'getState').mockReturnValue({
      ...baseSnapshot,
      outcome,
    });

    act(() => {
      ctx0.onCombatDone({
        result: {
          outcome: 'player_win',
          events: [],
          finalHp: { player: 30, ghost: 0 },
          endedAtTick: 5,
        },
        opponentGhostId: null,
        opponentClassId: null,
        damageDealt: 30,
        damageTaken: 0,
      });
    });
    await waitFor(() => {
      expect(getCtx().state.state.outcome).toBe(outcome);
    });

    // Restore mocks so the per-test assertion spy starts at zero
    // calls. simRun instance persists across renders (Phase 2b-1
    // useState design), so re-spying with vi.spyOn rebinds the same
    // method properties for fresh observation.
    vi.restoreAllMocks();
    return getCtx;
  }

  for (const outcome of ['won', 'eliminated', 'abandoned'] as const) {
    it(`onContinue no-ops when state.state.outcome === '${outcome}' (P1 crash repro from PR #14 Codex re-review)`, async () => {
      const getCtx = await setupTerminalState(outcome);
      const ctx = getCtx();
      const enterSpy = vi.spyOn(ctx.simRun!, 'enterCombatPhase');
      act(() => ctx.onContinue());
      expect(enterSpy).not.toHaveBeenCalled();
    });

    it(`onReroll no-ops when state.state.outcome === '${outcome}' (audit-revealed second P1 path)`, async () => {
      const getCtx = await setupTerminalState(outcome);
      const ctx = getCtx();
      const rerollSpy = vi.spyOn(ctx.simRun!, 'rerollShop');
      act(() => ctx.onReroll());
      expect(rerollSpy).not.toHaveBeenCalled();
    });

    it(`onCombatDone no-ops when state.state.outcome === '${outcome}' (defense-in-depth; transitively unreachable post-onContinue-guard)`, async () => {
      const getCtx = await setupTerminalState(outcome);
      const ctx = getCtx();
      const applySpy = vi.spyOn(ctx.simRun!, 'applyCombatOutcome');
      act(() => {
        ctx.onCombatDone({
          result: {
            outcome: 'player_win',
            events: [],
            finalHp: { player: 30, ghost: 0 },
            endedAtTick: 5,
          },
          opponentGhostId: null,
          opponentClassId: null,
          damageDealt: 30,
          damageTaken: 0,
        });
      });
      expect(applySpy).not.toHaveBeenCalled();
    });
  }
});

// ─── M1.5a PR 3 Phase 2b — relic offer + run-end detection ──────────
//
// Drives the client through a forged sync_from_sim (mock onCombatDone's
// inner getState) to simulate the sim arriving at the round/relic
// states that trigger pendingRelicOffer / isRunEnded predicates.
// Mid-only this phase: boss-offer detection is deferred to PR 3 part 2
// (requires restructuring onCombatDone's atomic applyCombatOutcome →
// advancePhase to expose sim's resolution-phase boss-grant window).

describe('useRun pendingRelicOffer + isRunEnded — M1.5a PR 3 Phase 2b detection', () => {
  async function driveSyncWithSnapshot(
    overrides: Partial<SimRunState>,
  ): Promise<() => ReturnType<typeof useRunContext>> {
    const { getCtx } = await renderAndCapture();
    const ctx0 = getCtx();
    act(() => ctx0.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const baseSnapshot = ctx0.simRun!.getState();
    vi.spyOn(ctx0.simRun!, 'applyCombatOutcome').mockImplementation(() => {});
    vi.spyOn(ctx0.simRun!, 'advancePhase').mockImplementation(() => {});
    vi.spyOn(ctx0.simRun!, 'getState').mockReturnValue({
      ...baseSnapshot,
      ...overrides,
    });

    act(() => {
      ctx0.onCombatDone({
        result: {
          outcome: 'player_win',
          events: [],
          finalHp: { player: 30, ghost: 0 },
          endedAtTick: 5,
        },
        opponentGhostId: null,
        opponentClassId: null,
        damageDealt: 30,
        damageTaken: 0,
      });
    });
    await waitFor(() => {
      expect(getCtx().state.combatActive).toBe(false);
    });
    return getCtx;
  }

  it('pendingRelicOffer fires for mid when sim transitions to round 6 with mid slot empty', async () => {
    const getCtx = await driveSyncWithSnapshot({
      currentRound: 6 as RoundNumber,
      relics: { starter: 'apprentices-loop', mid: null, boss: null } as RelicSlots,
      outcome: 'in_progress',
    });
    const ctx = getCtx();
    expect(ctx.pendingRelicOffer).not.toBeNull();
    expect(ctx.pendingRelicOffer!.slot).toBe('mid');
    // Tinker mid pool — 2 eligible relics per balance-bible.md § 12
    // (resonant-anchor + catalyst). Order is seed-shuffled by
    // generateMidRelicOffer; assert count + membership only.
    expect(ctx.pendingRelicOffer!.cards).toHaveLength(2);
    expect(new Set(ctx.pendingRelicOffer!.cards)).toEqual(
      new Set(['resonant-anchor', 'catalyst']),
    );
  });

  it('pendingRelicOffer is null when round < 6 (mid gate)', async () => {
    const getCtx = await driveSyncWithSnapshot({
      currentRound: 5 as RoundNumber,
      relics: { starter: 'apprentices-loop', mid: null, boss: null } as RelicSlots,
      outcome: 'in_progress',
    });
    expect(getCtx().pendingRelicOffer).toBeNull();
  });

  it('pendingRelicOffer clears when sim mid slot is filled', async () => {
    // Round 6 with mid already set — sim has already granted the relic,
    // so the offer must not re-surface (else duplicate grant attempts).
    const getCtx = await driveSyncWithSnapshot({
      currentRound: 6 as RoundNumber,
      relics: {
        starter: 'apprentices-loop',
        mid: 'resonant-anchor',
        boss: null,
      } as RelicSlots,
      outcome: 'in_progress',
    });
    expect(getCtx().pendingRelicOffer).toBeNull();
  });

  it('isRunEnded fires when sim outcome transitions to won', async () => {
    const getCtx = await driveSyncWithSnapshot({
      outcome: 'won' as RunOutcome,
    });
    expect(getCtx().isRunEnded).toBe(true);
  });

  it('isRunEnded fires when sim outcome transitions to eliminated', async () => {
    const getCtx = await driveSyncWithSnapshot({
      outcome: 'eliminated' as RunOutcome,
    });
    expect(getCtx().isRunEnded).toBe(true);
  });

  it('isRunEnded is false while outcome remains in_progress', async () => {
    const getCtx = await driveSyncWithSnapshot({
      outcome: 'in_progress' as RunOutcome,
    });
    expect(getCtx().isRunEnded).toBe(false);
  });

  it('pendingRelicOffer is null when outcome is terminal (offer suppressed at run-end)', async () => {
    // Defense in depth: even if round/relic predicates would otherwise
    // fire, a terminal outcome suppresses the offer.
    const getCtx = await driveSyncWithSnapshot({
      currentRound: 6 as RoundNumber,
      relics: { starter: 'apprentices-loop', mid: null, boss: null } as RelicSlots,
      outcome: 'won' as RunOutcome,
    });
    expect(getCtx().pendingRelicOffer).toBeNull();
    expect(getCtx().isRunEnded).toBe(true);
  });

  // ─── M1.5a PR 3 Phase 2d — boss offer + onCombatDone defer ──────
  //
  // Cases (a)-(d) per take-2 § Q6. Self-contained per-test setup (not
  // driveSyncWithSnapshot) chosen for the same reason as Phase 2.5d
  // setupTerminalState: each test needs distinct mock surfaces
  // (case (b) mocks grantRelic + getPhase; case (c) overrides
  // combatOutcome to ghost_win; case (a) asserts advancePhase NOT
  // called and needs spy access). Extending the existing helper to
  // cover all permutations would break the 7 existing Phase 2b call
  // sites' destructure shape. New variant helper would add net code
  // for ~4 tests' worth of reuse. Self-contained per-test is the
  // lower-overhead path.

  it('pendingRelicOffer fires for boss when sim history records round-11 player_win and boss slot empty', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx0 = getCtx();
    act(() => ctx0.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const baseSnapshot = ctx0.simRun!.getState();
    vi.spyOn(ctx0.simRun!, 'applyCombatOutcome').mockImplementation(() => {});
    const advancePhaseSpy = vi
      .spyOn(ctx0.simRun!, 'advancePhase')
      .mockImplementation(() => {});
    vi.spyOn(ctx0.simRun!, 'getState').mockReturnValue({
      ...baseSnapshot,
      currentRound: 11 as RoundNumber,
      outcome: 'in_progress' as RunOutcome,
      relics: {
        starter: 'apprentices-loop',
        mid: 'resonant-anchor',
        boss: null,
      } as RelicSlots,
      history: [
        {
          round: 11 as RoundNumber,
          outcome: 'win',
          damageDealt: 30,
          damageTaken: 0,
          goldEarnedThisRound: 5,
          opponentGhostId: null,
          opponentClassId: null,
        },
      ] as ReadonlyArray<RunHistoryEntry>,
    });

    act(() => {
      ctx0.onCombatDone({
        result: {
          outcome: 'player_win',
          events: [],
          finalHp: { player: 30, ghost: 0 },
          endedAtTick: 5,
        },
        opponentGhostId: null,
        opponentClassId: null,
        damageDealt: 30,
        damageTaken: 0,
      });
    });
    await waitFor(() => expect(getCtx().state.combatActive).toBe(false));

    const offer = getCtx().pendingRelicOffer;
    expect(offer).not.toBeNull();
    expect(offer!.slot).toBe('boss');
    // Tinker boss pool: worldforge-seed (1 relic per balance-bible.md § 12).
    expect(offer!.cards).toHaveLength(1);
    // advancePhase NOT called by onCombatDone on round-11-win-boss-empty defer.
    expect(advancePhaseSpy).not.toHaveBeenCalled();
  });

  it("grantSelectedRelic('boss', ...) clears the offer, resumes advancePhase, and transitions sim outcome to 'won' + phase to 'ended'", async () => {
    const { getCtx } = await renderAndCapture();
    const ctx0 = getCtx();
    act(() => ctx0.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const baseSnapshot = ctx0.simRun!.getState();
    const preGrantSnapshot: SimRunState = {
      ...baseSnapshot,
      currentRound: 11 as RoundNumber,
      outcome: 'in_progress' as RunOutcome,
      relics: {
        starter: 'apprentices-loop',
        mid: 'resonant-anchor',
        boss: null,
      } as RelicSlots,
      history: [
        {
          round: 11 as RoundNumber,
          outcome: 'win',
          damageDealt: 30,
          damageTaken: 0,
          goldEarnedThisRound: 5,
          opponentGhostId: null,
          opponentClassId: null,
        },
      ] as ReadonlyArray<RunHistoryEntry>,
    };
    const postGrantSnapshot: SimRunState = {
      ...preGrantSnapshot,
      outcome: 'won' as RunOutcome,
      relics: {
        ...preGrantSnapshot.relics,
        boss: 'worldforge-seed' as RelicId,
      } as RelicSlots,
    };

    vi.spyOn(ctx0.simRun!, 'applyCombatOutcome').mockImplementation(() => {});
    const advancePhaseSpy = vi
      .spyOn(ctx0.simRun!, 'advancePhase')
      .mockImplementation(() => {});
    const grantRelicSpy = vi
      .spyOn(ctx0.simRun!, 'grantRelic')
      .mockImplementation(() => {});
    // Pre-grant: sim is left at 'resolution' phase by onCombatDone's
    // defer. Post-grant: getPhase still returns 'resolution' (grantRelic
    // doesn't transition phase); the resume call to advancePhase fires
    // (mocked no-op here; sim's real advancePhase would transition to
    // 'ended').
    vi.spyOn(ctx0.simRun!, 'getPhase').mockReturnValue('resolution');
    const getStateSpy = vi.spyOn(ctx0.simRun!, 'getState');
    getStateSpy.mockReturnValue(preGrantSnapshot);

    act(() => {
      ctx0.onCombatDone({
        result: {
          outcome: 'player_win',
          events: [],
          finalHp: { player: 30, ghost: 0 },
          endedAtTick: 5,
        },
        opponentGhostId: null,
        opponentClassId: null,
        damageDealt: 30,
        damageTaken: 0,
      });
    });
    await waitFor(() => expect(getCtx().state.combatActive).toBe(false));

    // Boss offer live; defer held.
    expect(getCtx().pendingRelicOffer?.slot).toBe('boss');
    expect(advancePhaseSpy).not.toHaveBeenCalled();

    // Re-mock getState for the resume path (sync_from_sim post-grant).
    getStateSpy.mockReturnValue(postGrantSnapshot);

    act(() => {
      getCtx().grantSelectedRelic('boss', 'worldforge-seed' as RelicId);
    });

    expect(grantRelicSpy).toHaveBeenCalledOnce();
    expect(grantRelicSpy).toHaveBeenCalledWith('boss', 'worldforge-seed');
    // advancePhase resumed via phase-conditional check (Q1.b).
    expect(advancePhaseSpy).toHaveBeenCalledOnce();

    await waitFor(() => {
      expect(getCtx().state.state.outcome).toBe('won');
    });
    // Offer cleared (outcome guard + relics.boss now set).
    expect(getCtx().pendingRelicOffer).toBeNull();
    // RunEndOverlay would render (outcome !== 'in_progress').
    expect(getCtx().isRunEnded).toBe(true);
  });

  it("pendingRelicOffer is null on round-11 player_loss (no boss path); onCombatDone advances sim immediately to outcome 'eliminated'", async () => {
    const { getCtx } = await renderAndCapture();
    const ctx0 = getCtx();
    act(() => ctx0.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const baseSnapshot = ctx0.simRun!.getState();
    const preLossSnapshot: SimRunState = {
      ...baseSnapshot,
      currentRound: 11 as RoundNumber,
      outcome: 'in_progress' as RunOutcome,
      relics: {
        starter: 'apprentices-loop',
        mid: 'resonant-anchor',
        boss: null,
      } as RelicSlots,
      history: [
        {
          round: 11 as RoundNumber,
          outcome: 'loss',
          damageDealt: 18,
          damageTaken: 30,
          goldEarnedThisRound: 0,
          opponentGhostId: null,
          opponentClassId: null,
        },
      ] as ReadonlyArray<RunHistoryEntry>,
    };
    const postAdvanceSnapshot: SimRunState = {
      ...preLossSnapshot,
      outcome: 'eliminated' as RunOutcome,
    };

    vi.spyOn(ctx0.simRun!, 'applyCombatOutcome').mockImplementation(() => {});
    const advancePhaseSpy = vi
      .spyOn(ctx0.simRun!, 'advancePhase')
      .mockImplementation(() => {});
    // First two calls (goldBefore + postApply) see pre-loss; subsequent
    // (snapshot after advancePhase fires + any later) see post-advance.
    vi.spyOn(ctx0.simRun!, 'getState')
      .mockReturnValueOnce(preLossSnapshot)
      .mockReturnValueOnce(preLossSnapshot)
      .mockReturnValue(postAdvanceSnapshot);

    act(() => {
      ctx0.onCombatDone({
        result: {
          outcome: 'ghost_win',
          events: [],
          finalHp: { player: 0, ghost: 12 },
          endedAtTick: 3,
        },
        opponentGhostId: null,
        opponentClassId: null,
        damageDealt: 18,
        damageTaken: 30,
      });
    });
    await waitFor(() => expect(getCtx().state.combatActive).toBe(false));

    // No defer: advancePhase called by onCombatDone (loss path).
    expect(advancePhaseSpy).toHaveBeenCalledOnce();
    // No boss offer (last.outcome !== 'win').
    expect(getCtx().pendingRelicOffer).toBeNull();
    // Sim outcome → 'eliminated' (sim's endRun map for round-11 loss).
    expect(getCtx().state.state.outcome).toBe('eliminated');
    expect(getCtx().isRunEnded).toBe(true);
  });

  it('pendingRelicOffer for mid still fires on round 6-10 win (Phase 2b regression)', async () => {
    const { getCtx } = await renderAndCapture();
    const ctx0 = getCtx();
    act(() => ctx0.onContinue());
    await waitFor(() => expect(getCtx().state.combatActive).toBe(true));

    const baseSnapshot = ctx0.simRun!.getState();
    const postCombatSnapshot: SimRunState = {
      ...baseSnapshot,
      currentRound: 6 as RoundNumber,
      outcome: 'in_progress' as RunOutcome,
      relics: {
        starter: 'apprentices-loop',
        mid: null,
        boss: null,
      } as RelicSlots,
      history: [
        {
          round: 6 as RoundNumber,
          outcome: 'win',
          damageDealt: 25,
          damageTaken: 5,
          goldEarnedThisRound: 5,
          opponentGhostId: null,
          opponentClassId: null,
        },
      ] as ReadonlyArray<RunHistoryEntry>,
    };

    vi.spyOn(ctx0.simRun!, 'applyCombatOutcome').mockImplementation(() => {});
    const advancePhaseSpy = vi
      .spyOn(ctx0.simRun!, 'advancePhase')
      .mockImplementation(() => {});
    vi.spyOn(ctx0.simRun!, 'getState').mockReturnValue(postCombatSnapshot);

    act(() => {
      ctx0.onCombatDone({
        result: {
          outcome: 'player_win',
          events: [],
          finalHp: { player: 30, ghost: 0 },
          endedAtTick: 5,
        },
        opponentGhostId: null,
        opponentClassId: null,
        damageDealt: 25,
        damageTaken: 5,
      });
    });
    await waitFor(() => expect(getCtx().state.combatActive).toBe(false));

    // Mid offer fires (round 6 + mid empty, last.round=6 NOT 11).
    const offer = getCtx().pendingRelicOffer;
    expect(offer).not.toBeNull();
    expect(offer!.slot).toBe('mid');
    // Tinker mid pool: resonant-anchor + catalyst (2 relics).
    expect(offer!.cards).toHaveLength(2);
    // advancePhase fired normally — boss predicate fails on round 6.
    expect(advancePhaseSpy).toHaveBeenCalledOnce();
  });
});
