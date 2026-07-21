// Regression tests for the M1.3.4b option-2 zero-content fast-skip
// predicate (CombatOverlay.tsx).
//
//   Case A — canonical bypass: the original M1.3.4b step-4 halt-gate
//     fixture (round-1 empty bag + passive ghost item, sparse stalemate
//     at MAX_COMBAT_TICKS). Events array contains only combat_start +
//     combat_end. CombatOverlay must short-circuit the Phaser mount
//     and jump straight to RoundResolution.
//
//   Case B — Codex P1 regression: an active combat that nets to zero
//     HP delta on both sides (damage exactly offset by healing) but
//     contains real damage + heal events the player needs to see. The
//     bypass must NOT fire — Phaser must mount and play the events.
//     The pre-Codex-P1 predicate (`damageDealt === 0 && damageTaken
//     === 0 && outcome === 'draw'`) would have falsely matched this
//     fixture; the event-content-based predicate does not.
//
// The Phaser scene module (./CombatScene) is mocked so the test bundle
// never touches Phaser — for Case A the bypass means createCombatGame
// is never called, and the mock makes that observable; for Case B the
// mock just stands in for the real game-construction call.

import { useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RefObject } from 'react';
import type {
  ClassId,
  CombatEvent,
  CombatInput,
  CombatResult,
  PlacementId,
  RelicId,
} from '@packbreaker/content';
import { trophyDeltaFor } from '@packbreaker/sim';
import { CombatOverlay } from './CombatOverlay';
import { RunProvider, useRunContext } from '../run/RunContext';

// M1.5b PR 1: stub ClassSelectScreen so RunProvider transitions through
// the gate to RunContext.Provider directly. Same pattern as
// RunContext.test.tsx and RunScreen.test.tsx — class-select integration
// lives in dedicated test files. The stub's auto-confirm payload is
// parameterized via mocks.classSelectInput so the Phase 2.5 buildCombatInput
// regression tests can drive Marauder + Razor's Edge through the same
// surface without re-mocking.
vi.mock('../screens/ClassSelectScreen', () => ({
  ClassSelectScreen: function StubClassSelectScreen({
    onConfirm,
  }: {
    onConfirm: (input: { classId: ClassId; startingRelicId: RelicId }) => void;
  }) {
    useEffect(() => {
      onConfirm({
        classId: mocks.classSelectInput.classId,
        startingRelicId: mocks.classSelectInput.startingRelicId,
      });
    }, [onConfirm]);
    return null;
  },
}));

// M1.4a: CombatOverlay requires bagContainerRef. Tests don't render a
// real bag DOM, so a ref with current=null is sufficient — CombatOverlay
// uses optional-chained getBoundingClientRect and falls back to {0,0}.
const NULL_BAG_REF: RefObject<HTMLDivElement> = { current: null };

// Case A fixture — events = [combat_start, combat_end] only. Matches
// the failed M1.3.4b halt-gate scenario verbatim.
const ZERO_CONTENT_RESULT: CombatResult = {
  events: [
    { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
    {
      tick: 600,
      type: 'combat_end',
      outcome: 'draw',
      finalHp: { player: 30, ghost: 30 },
    },
  ],
  outcome: 'draw',
  finalHp: { player: 30, ghost: 30 },
  endedAtTick: 600,
  endReason: 'ko' as const,
};

// Case B fixture — outcome === 'draw' + damageDealt === 0 +
// damageTaken === 0 net (Math.max(0, 30 - 30) on both sides) BUT
// events array contains real damage + heal events that net to zero.
// The pre-Codex-P1 predicate would have falsely matched this; the
// event-content-based predicate does not.
const OFFSET_HEAL_RESULT: CombatResult = {
  events: [
    { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
    {
      tick: 50,
      type: 'damage',
      source: { side: 'ghost', placementId: 'g0' as PlacementId },
      target: 'player',
      amount: 5,
      remainingHp: 25,
    },
    {
      tick: 60,
      type: 'damage',
      source: { side: 'player', placementId: 'p0' as PlacementId },
      target: 'ghost',
      amount: 5,
      remainingHp: 25,
    },
    {
      tick: 100,
      type: 'heal',
      source: { side: 'player', placementId: 'p1' as PlacementId },
      target: 'player',
      amount: 5,
      newHp: 30,
    },
    {
      tick: 110,
      type: 'heal',
      source: { side: 'ghost', placementId: 'g1' as PlacementId },
      target: 'ghost',
      amount: 5,
      newHp: 30,
    },
    {
      tick: 600,
      type: 'combat_end',
      outcome: 'draw',
      finalHp: { player: 30, ghost: 30 },
    },
  ],
  outcome: 'draw',
  finalHp: { player: 30, ghost: 30 },
  endedAtTick: 600,
  endReason: 'ko' as const,
};

// vi.mock factories are hoisted to the top of the module — any
// top-level mock-state references must be created via vi.hoisted so
// the references survive the lift. classSelectInput is read by the
// ClassSelectScreen stub above; reset in beforeEach to keep existing
// tests on the default Tinker payload.
const mocks = vi.hoisted(() => ({
  createCombatGame: vi.fn(),
  runCombat: vi.fn(),
  classSelectInput: {
    classId: 'tinker',
    startingRelicId: 'apprentices-loop',
  } as { classId: ClassId; startingRelicId: RelicId },
}));

beforeEach(() => {
  mocks.classSelectInput.classId = 'tinker' as ClassId;
  mocks.classSelectInput.startingRelicId = 'apprentices-loop' as RelicId;
  // mock.calls accumulates across tests by default — clear runCombat
  // history so each test reads only its own call (the Phase 2.5
  // propagation tests assert on the FIRST runCombat call).
  mocks.runCombat.mockClear();
  mocks.createCombatGame.mockClear();
});

vi.mock('./sim-bridge.combat', () => ({
  runCombat: mocks.runCombat,
}));

// Mock the Phaser scene so the test bundle doesn't pull Phaser into
// happy-dom (it isn't well-supported there). For Case A the bypass
// means createCombatGame is never called — the mock asserts that.
// For Case B the mock just stands in for the real game-construction
// call so the Phaser-mount path is observable.
vi.mock('./CombatScene', () => ({
  createCombatGame: mocks.createCombatGame,
  CombatScene: { KEY: 'MockedCombatScene' },
  // M1.4a: CombatOverlay also imports the portrait ratio consts to
  // project canvas-rect → screen-space portrait anchors. The mock
  // returns the same numeric ratios so the projection math runs.
  PORTRAIT_X_RATIO_PLAYER: 0.25,
  PORTRAIT_X_RATIO_GHOST: 0.75,
  PORTRAIT_Y_RATIO: 0.5,
}));

describe('CombatOverlay — zero-content fast-skip predicate (M1.3.4b + Codex P1 amendment)', () => {
  it('Case A — bypasses Phaser mount when events are only combat_start + combat_end (canonical empty stalemate)', async () => {
    mocks.runCombat.mockReturnValue(ZERO_CONTENT_RESULT);
    mocks.createCombatGame.mockClear();
    const onDone = vi.fn();

    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={onDone} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );

    // M1.5b PR 1: the lazy class-select Suspense fallback shares the
    // run-boot-fallback testid with the non-Suspense createRun-in-flight
    // fallback. Wait for the combat overlay's resolution panel itself
    // (DRAW header from the zero-content bypass — CF-84 renders a draw
    // honestly as DRAW, not the pre-CF-84 "DEFEAT"/"LOST") rather than
    // fallback-absence — the brief stub-mounted state would also satisfy
    // the negation but doesn't have the consumer mounted yet.
    await waitFor(() => {
      expect(screen.getByText(/DRAW/)).toBeInTheDocument();
    });

    // Phaser canvas container is NOT rendered — the option-2 branch
    // initializes phase to 'resolved' on first render.
    expect(screen.queryByTestId('combat-canvas-container')).toBeNull();
    // createCombatGame is never called.
    expect(mocks.createCombatGame).not.toHaveBeenCalled();

    // RoundResolution renders with DRAW header (CF-84: a draw renders honestly
    // as DRAW, not the pre-CF-84 "DEFEAT"/"LOST") and DEALT 0 / TAKEN 0.
    expect(screen.getByText(/DRAW/)).toBeInTheDocument();
    expect(screen.getByText(/DEALT/)).toBeInTheDocument();
    expect(screen.getByText(/TAKEN/)).toBeInTheDocument();

    // NEXT click dispatches combat_done with the zero-content payload —
    // reducer + telemetry path stay intact.
    fireEvent.click(screen.getByRole('button', { name: /NEXT ROUND/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
    const payload = onDone.mock.calls[0]![0] as {
      damageDealt: number;
      damageTaken: number;
      result: CombatResult;
      opponentGhostId: unknown;
      opponentClassId: unknown;
    };
    expect(payload.damageDealt).toBe(0);
    expect(payload.damageTaken).toBe(0);
    expect(payload.result.outcome).toBe('draw');
    expect(payload.result.finalHp).toEqual({ player: 30, ghost: 30 });
    // M1.5a PR 2 Phase 2b-2 Q7: opponentClassId now threaded from the
    // ghost build (makeGhostForRound returns ClassId 'marauder' on odd
    // rounds, 'tinker' on even rounds). At round 1 (fresh run), ghost
    // is Marauder; assert opponentClassId is the deterministic value.
    expect(payload.opponentClassId).toBe('marauder');
  });

  it('Case B — does NOT bypass when events contain damage + heal that net to zero (Codex P1 regression)', async () => {
    mocks.runCombat.mockReturnValue(OFFSET_HEAL_RESULT);
    mocks.createCombatGame.mockClear();
    const onDone = vi.fn();

    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={onDone} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );

    // M1.5b PR 1: wait for combat-canvas-container directly (not
    // fallback-absence — see Case A note for the rationale).
    await waitFor(() => {
      expect(screen.getByTestId('combat-canvas-container')).toBeInTheDocument();
    });
    expect(screen.getByTestId('combat-skip')).toBeInTheDocument();

    // createCombatGame is invoked from useEffect's start() — the call
    // happens after a microtask flush (start is async even when
    // document.fonts is unavailable in happy-dom), so wait for it.
    await waitFor(() => {
      expect(mocks.createCombatGame).toHaveBeenCalled();
    });

    // RoundResolution must NOT be rendered yet — the player has not
    // reached the resolution phase. DEFEAT / VICTORY headers belong
    // to RoundResolution and would only appear after onCombatEnd.
    expect(screen.queryByText(/DEFEAT/)).toBeNull();
    expect(screen.queryByText(/VICTORY/)).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 1 Phase 2.5 — buildCombatInput propagation regression
// (Codex P1 finding on PR 16 ea2a4b0).
//
// Pre-fix, buildCombatInput hardcoded the player Combatant's classId to
// 'tinker' and relics to emptyRelicSlots(). Any Marauder run played as
// Tinker in combat; every starter relic's combat effect silently
// no-opped (Razor's Edge bonusBaseDamage, Bloodfont lifestealPct, etc.).
//
// Post-fix, both come from state.classId / state.relics (mirrored by
// applySimSnapshot from sim's authoritative snapshot). These tests
// drive the class-select stub with Marauder + Razor's Edge through the
// same render path the player takes, then assert on the runCombat
// mock's first argument that the CombatInput's player Combatant was
// constructed from the player-chosen class and starter relic.
// ────────────────────────────────────────────────────────────────────

describe('CombatOverlay — buildCombatInput propagation (Phase 2.5 Codex P1)', () => {
  it('Marauder + Razor’s Edge: player Combatant has classId=marauder + relics.starter=razors-edge', async () => {
    mocks.classSelectInput.classId = 'marauder' as ClassId;
    mocks.classSelectInput.startingRelicId = 'razors-edge' as RelicId;
    mocks.runCombat.mockReturnValue(ZERO_CONTENT_RESULT);
    mocks.createCombatGame.mockClear();

    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={vi.fn()} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );

    await waitFor(() => {
      expect(mocks.runCombat).toHaveBeenCalled();
    });

    const firstCall = mocks.runCombat.mock.calls[0]!;
    const input = firstCall[0] as CombatInput;
    expect(input.player.classId).toBe('marauder');
    expect(input.player.relics.starter).toBe('razors-edge');
    expect(input.player.relics.mid).toBeNull();
    expect(input.player.relics.boss).toBeNull();
  });

  it('Tinker + Apprentice’s Loop: player Combatant has classId=tinker + relics.starter=apprentices-loop (control)', async () => {
    mocks.classSelectInput.classId = 'tinker' as ClassId;
    mocks.classSelectInput.startingRelicId = 'apprentices-loop' as RelicId;
    mocks.runCombat.mockReturnValue(ZERO_CONTENT_RESULT);
    mocks.createCombatGame.mockClear();

    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={vi.fn()} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );

    await waitFor(() => {
      expect(mocks.runCombat).toHaveBeenCalled();
    });

    const firstCall = mocks.runCombat.mock.calls[0]!;
    const input = firstCall[0] as CombatInput;
    expect(input.player.classId).toBe('tinker');
    expect(input.player.relics.starter).toBe('apprentices-loop');
  });
});

// CF-72 Phase 2 — the render-order invariant the shared-derivation mechanism
// rests on (decision-log.md 2026-07-15 § "CF-72 Phase 2 Step 0 halt").
//
// CombatOverlay computes the panel's trophy number by calling the sim's
// trophyDeltaFor with (round, ctx.state.state.trophy). That is only correct
// because RoundResolution paints at phase === 'resolved', STRICTLY BEFORE
// handleNext → onDone → onCombatDone → applyCombatOutcome commits the mutation.
// So the trophy the panel reads is the same pre-combat value the sim will read.
//
// If a future refactor ever commits the outcome before the panel renders, the
// overlay would read a POST-win trophy and derive from the wrong inputs — the
// display would silently disagree with the sim again, which is exactly the CF-38
// co-drift this mechanism exists to prevent. Nothing else in the suite pins that
// ordering, so it is asserted here directly rather than left to coincidence.
describe('CombatOverlay — pre-commit trophy read (CF-72 / CF-38 load-bearing invariant)', () => {
  const WIN_RESULT: CombatResult = {
    events: [
      { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
      {
        tick: 50,
        type: 'damage',
        source: { side: 'player', placementId: 'p0' as PlacementId },
        target: 'ghost',
        amount: 30,
        remainingHp: 0,
      },
      {
        tick: 60,
        type: 'combat_end',
        outcome: 'player_win',
        finalHp: { player: 30, ghost: 0 },
      },
    ],
    outcome: 'player_win',
    finalHp: { player: 30, ghost: 0 },
    endedAtTick: 60,
    endReason: 'ko' as const,
  };

  it('panel derives from the PRE-combat trophy at phase === resolved, and the sim has not yet committed', async () => {
    mocks.runCombat.mockReturnValue(WIN_RESULT);
    const onDone = vi.fn();
    const reads: Array<{ trophy: number; round: number }> = [];

    function TrophyProbe() {
      const ctx = useRunContext();
      reads.push({ trophy: ctx.state.state.trophy, round: ctx.state.state.round });
      return null;
    }

    render(
      <RunProvider>
        <TrophyProbe />
        <CombatOverlay active={true} onDone={onDone} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );

    // A win carries meaningful events, so the zero-content bypass does NOT
    // fire (it is draw-gated) — Phaser mounts and the overlay waits for the
    // scene's onCombatEnd to move to 'resolved'.
    await waitFor(() => {
      expect(mocks.createCombatGame).toHaveBeenCalled();
    });
    const sceneOpts = mocks.createCombatGame.mock.calls[0]![1] as {
      onCombatEnd: () => void;
    };
    act(() => {
      sceneOpts.onCombatEnd();
    });

    await waitFor(() => {
      expect(screen.getByText(/VICTORY/)).toBeInTheDocument();
    });

    // THE INVARIANT: with the resolution panel on screen, the run state still
    // holds the pre-combat trophy. onDone is a spy here, so nothing has
    // committed — this is the real ordering, not an artifact of the stub.
    const atResolution = reads[reads.length - 1]!;
    expect(atResolution.trophy).toBe(0);
    expect(atResolution.round).toBe(1);
    expect(onDone).not.toHaveBeenCalled();

    // And the number rendered is the sim's own derivation over those exact
    // inputs — round 1 from trophy 0 → +10. Asserting against trophyDeltaFor
    // rather than the literal 10 is the point: if the ratified schedule ever
    // changes, this test follows the sim instead of pinning a stale twin.
    const expected = trophyDeltaFor('win', atResolution.round, atResolution.trophy);
    expect(expected).toBe(10);
    expect(screen.getByText(`+${expected}`)).toBeInTheDocument();

    // The commit is what the NEXT click triggers — strictly after the read.
    fireEvent.click(screen.getByRole('button', { name: /NEXT ROUND/i }));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// CF-83 Fix A — the DEALT/TAKEN payload is computed by the sim's shared
// computeDamageStats (gross item + status damage, ramp-excluded), the same
// definition round_end telemetry uses — NOT the deleted client-side
// `Math.max(0, initialHp - finalHp)` delta. Two Rule-28 falsifiable tests:
// each FAILS against the old finalHp delta and PASSES with computeDamageStats
// (break/restore proven in the PR-A round-2 report).
// ────────────────────────────────────────────────────────────────────
describe('CombatOverlay — DEALT/TAKEN via computeDamageStats (CF-83 Fix A)', () => {
  // Faithful empty-bag ramp draw — mirrors applyResolutionRamp: from tick 500
  // drain 3/tick per side (floored at 0), NO damage/status_tick event, mutual
  // KO. ramp_tick is a MEANINGFUL_EVENT_TYPE so this MOUNTS (not a zero-content
  // bypass), exactly like a real ramp draw.
  function buildEmptyBagRampDraw(startHp: number): CombatResult {
    const events: CombatEvent[] = [
      { tick: 0, type: 'combat_start', playerHp: startHp, ghostHp: startHp },
    ];
    let php = startHp;
    let ghp = startHp;
    let tick = 500;
    while (php > 0 || ghp > 0) {
      if (php > 0) {
        const amount = Math.min(3, php);
        php -= amount;
        events.push({ tick, type: 'ramp_tick', target: 'player', amount, remainingHp: php });
      }
      if (ghp > 0) {
        const amount = Math.min(3, ghp);
        ghp -= amount;
        events.push({ tick, type: 'ramp_tick', target: 'ghost', amount, remainingHp: ghp });
      }
      tick += 1;
    }
    events.push({ tick, type: 'combat_end', outcome: 'draw', finalHp: { player: 0, ghost: 0 } });
    return {
      events,
      outcome: 'draw',
      finalHp: { player: 0, ghost: 0 },
      endedAtTick: tick,
      endReason: 'ramp_ko',
    };
  }

  // Real combat damage recovered by a heal: player takes 12 (gross), heals 8
  // (net 4), deals 30 to kill the ghost. computeDamageStats.damageTaken = gross
  // 12; the deleted finalHp delta reported net 4 (initialHp - finalHp 26).
  const DAMAGE_HEAL_RESULT: CombatResult = {
    events: [
      { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
      { tick: 20, type: 'damage', source: { side: 'ghost', placementId: 'g0' as PlacementId }, target: 'player', amount: 12, remainingHp: 18 },
      { tick: 25, type: 'heal', source: { side: 'player', placementId: 'p1' as PlacementId }, target: 'player', amount: 8, newHp: 26 },
      { tick: 30, type: 'damage', source: { side: 'player', placementId: 'p0' as PlacementId }, target: 'ghost', amount: 30, remainingHp: 0 },
      { tick: 30, type: 'combat_end', outcome: 'player_win', finalHp: { player: 26, ghost: 0 } },
    ],
    outcome: 'player_win',
    finalHp: { player: 26, ghost: 0 },
    endedAtTick: 30,
    endReason: 'ko',
  };

  it('empty-bag ramp-resolved draw reports DEALT 0 / TAKEN 0 (not the ramp drain)', async () => {
    mocks.runCombat.mockReturnValue(buildEmptyBagRampDraw(30));
    const onDone = vi.fn();
    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={onDone} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );
    // ramp_tick is meaningful → Phaser mounts; wait for the scene, then drive
    // its onCombatEnd to reach the resolution panel.
    await waitFor(() => {
      expect(mocks.createCombatGame).toHaveBeenCalled();
    });
    const sceneOpts = mocks.createCombatGame.mock.calls[0]![1] as { onCombatEnd: () => void };
    act(() => {
      sceneOpts.onCombatEnd();
    });
    await waitFor(() => {
      expect(screen.getByText(/DRAW/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /NEXT ROUND/i }));
    const payload = onDone.mock.calls[0]![0] as { damageDealt: number; damageTaken: number };
    // Gross item damage is 0 — the bag did nothing, the ramp ended it. The
    // deleted finalHp delta reported the full drain (initialHp - 0) as damage.
    expect(payload.damageDealt).toBe(0);
    expect(payload.damageTaken).toBe(0);
  });

  it('damage + self-heal reports GROSS item damage, not net-of-heal', async () => {
    mocks.runCombat.mockReturnValue(DAMAGE_HEAL_RESULT);
    const onDone = vi.fn();
    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={onDone} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );
    await waitFor(() => {
      expect(mocks.createCombatGame).toHaveBeenCalled();
    });
    const sceneOpts = mocks.createCombatGame.mock.calls[0]![1] as { onCombatEnd: () => void };
    act(() => {
      sceneOpts.onCombatEnd();
    });
    await waitFor(() => {
      expect(screen.getByText(/VICTORY/)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /NEXT ROUND/i }));
    const payload = onDone.mock.calls[0]![0] as { damageDealt: number; damageTaken: number };
    // Player took 12 gross, recovered 8 (net 4). TAKEN is the gross 12 — the
    // deleted finalHp delta reported net 4.
    expect(payload.damageTaken).toBe(12);
    // 30 dealt to the ghost (no ghost heal → gross == net); locks the dealt side.
    expect(payload.damageDealt).toBe(30);
  });
});

// ────────────────────────────────────────────────────────────────────
// CF-85 Surface 2b — the reveal reaches the REAL post-combat path
// (decision-log.md 2026-07-20 § "CF-85 SCOPE REDRAWN against Phase-1
// read-only …"). Pattern-9 antidote: the RoundResolution.test.tsx unit
// suite instantiates the component WITH opponentBuild and passes — that
// proves the component, not the wiring. This test drives the REAL
// CombatOverlay resolved-phase render (runCombat mocked; the ghost build
// flows through the REAL buildCombatInput → makeGhostForRound →
// simBagToClientBag, exactly as in production) and asserts the
// "VIEW OPPONENT BUILD" toggle actually renders + opens through the real
// BagBoard renderer. If CombatOverlay ever stops supplying opponentBuild
// (the "component built, call site never calls" defect), this fails.
// ────────────────────────────────────────────────────────────────────
describe('CombatOverlay — CF-85 S2b opponent-build reveal reaches the real resolved path', () => {
  const WIN_RESULT: CombatResult = {
    events: [
      { tick: 0, type: 'combat_start', playerHp: 30, ghostHp: 30 },
      {
        tick: 50,
        type: 'damage',
        source: { side: 'player', placementId: 'p0' as PlacementId },
        target: 'ghost',
        amount: 30,
        remainingHp: 0,
      },
      { tick: 60, type: 'combat_end', outcome: 'player_win', finalHp: { player: 30, ghost: 0 } },
    ],
    outcome: 'player_win',
    finalHp: { player: 30, ghost: 0 },
    endedAtTick: 60,
    endReason: 'ko' as const,
  };

  async function renderToResolution() {
    mocks.runCombat.mockReturnValue(WIN_RESULT);
    render(
      <RunProvider>
        <CombatOverlay active={true} onDone={vi.fn()} bagContainerRef={NULL_BAG_REF} />
      </RunProvider>,
    );
    await waitFor(() => {
      expect(mocks.createCombatGame).toHaveBeenCalled();
    });
    const sceneOpts = mocks.createCombatGame.mock.calls[0]![1] as { onCombatEnd: () => void };
    act(() => {
      sceneOpts.onCombatEnd();
    });
    await waitFor(() => {
      expect(screen.getByText(/VICTORY/)).toBeInTheDocument();
    });
  }

  it('supplies opponentBuild through the real render path: the toggle renders, collapsed', async () => {
    await renderToResolution();
    // The toggle exists ONLY when CombatOverlay passes opponentBuild — the
    // exact wiring the component unit test cannot exercise.
    expect(screen.getByTestId('view-opponent-build')).toBeInTheDocument();
    // Collapsed by default — the board is not shown until the toggle is clicked.
    expect(screen.queryByTestId('opponent-build-board')).toBeNull();
  });

  it('opens to the ghost’s real build through the real BagBoard renderer (24-cell grid + ≥1 item)', async () => {
    await renderToResolution();
    fireEvent.click(screen.getByTestId('view-opponent-build'));
    const board = screen.getByTestId('opponent-build-board');
    // Real BagBoard grid — 6×4 = 24 drop cells (same renderer the player
    // board uses; no bespoke grid).
    expect(board.querySelectorAll('[data-cell-col]')).toHaveLength(24);
    // The round-1 ghost carries ≥1 real item (makeGhostForRound
    // ITEM_COUNT_BY_ROUND[0] === 1), rendered read-only (cursor:default).
    expect(
      board.querySelectorAll('[style*="cursor: default"]').length,
    ).toBeGreaterThanOrEqual(1);
    // Fail-closed inspector on opponent items (CF 57): no buttons inside.
    expect(within(board).queryAllByRole('button')).toHaveLength(0);
  });
});
