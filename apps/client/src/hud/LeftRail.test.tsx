// M1.5b PR 1 Phase 2.5b — LeftRail integration tests. Closes the gap
// that let F.3 / F.5 pass while LeftRail lied: the state-write chain
// was always correct, but no test rendered the desktop chrome and
// asserted the visible text reflected the chosen class + relics.
//
// Mocks useRunContext to drive the rendered state directly (same
// pattern as RelicOfferModal.test.tsx) — LeftRail consumes
// authoritative state via context, not props.

import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  DEFAULT_RULESET,
  type ClassId,
  type ContractId,
  type RelicId,
  type RunId,
  type RunOutcome,
  type SimSeed,
} from '@packbreaker/content';
import type { RunState } from '../run/types';

type MockUseRunReturn = {
  state: { state: RunState };
};

let mockContext: MockUseRunReturn;

vi.mock('../run/RunContext', () => ({
  useRunContext: () => mockContext,
}));

// Import after vi.mock so the lazy module resolution picks up the
// mocked RunContext.
import { LeftRail } from './LeftRail';
// CF-85: expected intent/hint values compute through the same pure
// derivations the component consumes (no twin literals).
import { ghostIntentForRound } from '../combat/ghostIntent';
import { trophyDeltaFor } from '../run/sim-bridge';

function makeRunStateFixture(overrides: Partial<RunState> = {}): RunState {
  return {
    round: 1,
    totalRounds: 11,
    hearts: 3,
    maxHearts: 3,
    gold: 4,
    trophy: 0,
    rerollCount: 0,
    className: 'Tinker',
    contractName: 'Neutral',
    contractText: 'No modifiers',
    ruleset: DEFAULT_RULESET,
    runId: 'test-run' as RunId,
    classId: 'tinker' as ClassId,
    contractId: 'neutral' as ContractId,
    derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
    relics: { starter: 'apprentices-loop' as RelicId, mid: null, boss: null },
    bossRewardItemId: null,
    outcome: 'in_progress' as RunOutcome,
    seed: 99999 as SimSeed,
    history: [],
    ...overrides,
  };
}

function mountWithState(state: RunState) {
  mockContext = { state: { state } };
  return render(<LeftRail />);
}

describe('LeftRail', () => {
  it('Tinker + Apprentice\'s Loop default: class card + starter slot render canonical content', () => {
    const { getByText, getAllByText } = mountWithState(makeRunStateFixture());
    expect(getByText('CLASS')).toBeInTheDocument();
    expect(getByText('Tinker')).toBeInTheDocument();
    expect(
      getByText(/First recipe each round costs no action/),
    ).toBeInTheDocument();
    expect(getByText("Apprentice's Loop")).toBeInTheDocument();
    expect(getByText('+1 reroll per round.')).toBeInTheDocument();
    // Mid + boss slots EMPTY.
    expect(getAllByText('EMPTY')).toHaveLength(2);
  });

  it('Marauder + Iron Will: card + starter slot reflect Marauder content (the playtest catch)', () => {
    const { getByText, getAllByText, getByTestId, queryByText } = mountWithState(
      makeRunStateFixture({
        className: 'Marauder',
        classId: 'marauder' as ClassId,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: null,
          boss: null,
        },
      }),
    );
    // Scoped to the player class card: the CF-85 intent panel can
    // legitimately render the same class name for an odd-round ghost.
    expect(getByTestId('player-class').textContent).toBe('Marauder');
    expect(
      getByText(/\+1 base damage on every damage effect/),
    ).toBeInTheDocument();
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText('+1 heart.')).toBeInTheDocument();
    // Tinker / Apprentice's Loop must NOT appear under a Marauder run.
    expect(queryByText('Tinker')).toBeNull();
    expect(queryByText("Apprentice's Loop")).toBeNull();
    expect(getAllByText('EMPTY')).toHaveLength(2);
  });

  it('Mid relic granted: mid slot renders the chosen relic (Berserker\'s Pendant), boss stays EMPTY', () => {
    const { getByText, getAllByText } = mountWithState(
      makeRunStateFixture({
        className: 'Marauder',
        classId: 'marauder' as ClassId,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: 'berserkers-pendant' as RelicId,
          boss: null,
        },
      }),
    );
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText("Berserker's Pendant")).toBeInTheDocument();
    expect(
      getByText('+3 base damage on every damage effect. Stacks.'),
    ).toBeInTheDocument();
    // Only the boss slot is EMPTY.
    expect(getAllByText('EMPTY')).toHaveLength(1);
  });

  it('Boss relic granted: all 3 slots render named content; no EMPTY', () => {
    const { getByText, queryAllByText } = mountWithState(
      makeRunStateFixture({
        className: 'Marauder',
        classId: 'marauder' as ClassId,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: 'berserkers-pendant' as RelicId,
          boss: 'conquerors-crown' as RelicId,
        },
      }),
    );
    expect(getByText('Iron Will')).toBeInTheDocument();
    expect(getByText("Berserker's Pendant")).toBeInTheDocument();
    expect(getByText("Conqueror's Crown")).toBeInTheDocument();
    expect(
      getByText(/\+4 base damage on every damage effect; \+3g per round won/),
    ).toBeInTheDocument();
    expect(queryAllByText('EMPTY')).toHaveLength(0);
  });

  it('Tinker mid + boss path: catalyst mid + worldforge-seed boss render with descriptions', () => {
    const { getByText } = mountWithState(
      makeRunStateFixture({
        relics: {
          starter: 'apprentices-loop' as RelicId,
          mid: 'catalyst' as RelicId,
          boss: 'worldforge-seed' as RelicId,
        },
      }),
    );
    expect(getByText('Tinker')).toBeInTheDocument();
    expect(getByText('Catalyst')).toBeInTheDocument();
    expect(getByText('+30% recipe potency. Stacks.')).toBeInTheDocument();
    expect(getByText('Worldforge Seed')).toBeInTheDocument();
    expect(
      getByText('+6 starting gold and +10% recipe potency.'),
    ).toBeInTheDocument();
  });
});

// ─── CF-85 Surfaces 2a + 3 (decision-log.md 2026-07-20 § "CF-85 SCOPE ───
// REDRAWN against Phase-1 read-only …"). Acceptance: the intent panel
// shows the REAL apparent class + REAL 1–2 marquee silhouettes for the
// current round's ghost (changing round-to-round, never the full bag),
// and the run-goal hint shows the real round + real SIGNED win/loss
// trophy deltas + the contract objective — no hardcoded "Round 4"/"±1".
//
// Expected values compute through the SAME derivations the component
// uses (ghostIntentForRound / trophyDeltaFor) — the CF-38 co-drift
// antidote: no twin literals that could agree by coincidence.

describe('LeftRail — CF-85 real opponent intent (Surface 2a) + real run-goal hint (Surface 3)', () => {
  it('renders the REAL ghost class and REAL marquee silhouettes for round 1 (not the hardcoded sword+shield pair)', () => {
    const state = makeRunStateFixture();
    const intent = ghostIntentForRound(state.seed, state.round, state.ruleset.bagDimensions);
    const { getByTestId } = mountWithState(state);

    expect(getByTestId('intent-class').textContent).toBe(intent.classLabel);
    expect(intent.marqueeItemIds.length).toBeGreaterThan(0);
    expect(intent.marqueeItemIds.length).toBeLessThanOrEqual(2);
    for (const id of intent.marqueeItemIds) {
      expect(getByTestId(`intent-silhouette-${id}`)).toBeInTheDocument();
    }
  });

  it('intent changes round-to-round: round 2 renders the round-2 ghost class + marquee', () => {
    const state = makeRunStateFixture({ round: 2 });
    const intent = ghostIntentForRound(state.seed, 2, state.ruleset.bagDimensions);
    const { getByTestId } = mountWithState(state);
    expect(getByTestId('intent-class').textContent).toBe(intent.classLabel);
    for (const id of intent.marqueeItemIds) {
      expect(getByTestId(`intent-silhouette-${id}`)).toBeInTheDocument();
    }
  });

  it('never renders more than 2 marquee silhouettes (gdd.md §14: never the full bag pre-combat)', () => {
    // Round 9 ghost carries 4 items (ITEM_COUNT_BY_ROUND) — the panel must not show them all.
    const state = makeRunStateFixture({ round: 9 });
    const { container } = mountWithState(state);
    expect(
      container.querySelectorAll('[data-testid^="intent-silhouette-"]').length,
    ).toBeLessThanOrEqual(2);
  });

  it('run-goal hint shows real round + real signed win/loss deltas (win +10 / loss 0 at round 1, trophy 0)', () => {
    const state = makeRunStateFixture();
    const win = trophyDeltaFor('win', state.round, state.trophy);
    const loss = trophyDeltaFor('loss', state.round, state.trophy);
    const { getByTestId } = mountWithState(state);
    expect(getByTestId('intent-hint').textContent).toBe(
      `Round ${state.round} · Win +${win} · Loss ${loss}`,
    );
  });

  it('loss delta is the real POST-CLAMP value (round 2, trophy 12 → Loss -5), not a hardcoded ±1', () => {
    const state = makeRunStateFixture({ round: 2, trophy: 12 });
    const win = trophyDeltaFor('win', 2, 12);
    const loss = trophyDeltaFor('loss', 2, 12);
    const { getByTestId, queryByText } = mountWithState(state);
    expect(loss).toBe(-5);
    expect(getByTestId('intent-hint').textContent).toBe(`Round 2 · Win +${win} · Loss ${loss}`);
    expect(queryByText(/±1 trophy/)).toBeNull();
    expect(queryByText('Round 4 · ±1 trophy')).toBeNull();
  });

  it('hint carries the contract objective (state.contractName / contractText)', () => {
    const { getByTestId } = mountWithState(makeRunStateFixture());
    const contract = getByTestId('intent-contract').textContent ?? '';
    expect(contract).toContain('Neutral');
    expect(contract).toContain('No modifiers');
  });
});
