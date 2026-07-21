// CF-85 Surface 2a (mobile mirror) — the compact top bar's opponent
// silhouettes must be the REAL round-ghost marquee (same derivation as
// the desktop LeftRail), not the hardcoded sword+shield prototype pair.
//
// AbandonRunMenu is mocked out: it owns its own tested flow
// (AbandonFlow.test.tsx) and drags context this unit doesn't need.

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
import type { RunState } from '../../run/types';
import { ghostIntentForRound } from '../../combat/ghostIntent';

vi.mock('../../run/AbandonRunMenu', () => ({
  AbandonRunMenu: () => null,
}));

import { MobileTopBar } from './MobileTopBar';

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
    seed: 77777 as SimSeed,
    history: [],
    ...overrides,
  };
}

describe('MobileTopBar — CF-85 real opponent marquee', () => {
  it('renders the REAL round-1 marquee silhouettes (same derivation as desktop)', () => {
    const state = makeRunStateFixture();
    const intent = ghostIntentForRound(state.seed, state.round, state.ruleset.bagDimensions);
    const { getByTestId, container } = render(<MobileTopBar state={state} />);

    expect(intent.marqueeItemIds.length).toBeGreaterThan(0);
    for (const id of intent.marqueeItemIds) {
      expect(getByTestId(`intent-silhouette-${id}`)).toBeInTheDocument();
    }
    // Exactly the marquee — nothing extra, never more than 2 (gdd.md §14).
    expect(
      container.querySelectorAll('[data-testid^="intent-silhouette-"]'),
    ).toHaveLength(intent.marqueeItemIds.length);
  });

  it('marquee tracks the round: round 2 renders the round-2 ghost marquee', () => {
    const state = makeRunStateFixture({ round: 2 });
    const intent = ghostIntentForRound(state.seed, 2, state.ruleset.bagDimensions);
    const { getByTestId } = render(<MobileTopBar state={state} />);
    for (const id of intent.marqueeItemIds) {
      expect(getByTestId(`intent-silhouette-${id}`)).toBeInTheDocument();
    }
  });
});
