// ShopPanel smoke test: 5 slots + reroll cost + Continue CTA.
// Wrapped in DndContext because each ShopSlot uses @dnd-kit's
// useDraggable and the SellZone uses useDroppable.

import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import {
  DEFAULT_RULESET,
  type ClassId,
  type ContractId,
  type RunId,
  type RunOutcome,
  type SimSeed,
} from '@packbreaker/content';
import type { ItemId, RunState, ShopSlot } from '../run/types';
import { ShopPanel } from './ShopPanel';

const TEST_SEED = 12345 as SimSeed;

const TEST_RUN_STATE: RunState = {
  round: 4,
  totalRounds: 11,
  hearts: 3,
  maxHearts: 3,
  gold: 8,
  trophy: 142,
  rerollCount: 0,
  className: 'Tinker',
  contractName: 'Neutral',
  contractText: 'No modifiers',
  ruleset: DEFAULT_RULESET,
  runId: 'test-run' as RunId,
  classId: 'tinker' as ClassId,
  contractId: 'neutral' as ContractId,
  derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
  relics: { starter: null, mid: null, boss: null },
  outcome: 'in_progress' as RunOutcome,
  seed: TEST_SEED,
  history: [],
};

const TEST_SHOP: ShopSlot[] = [
  { uid: 's1', itemId: 'iron-sword' as ItemId, cost: 3 },
  { uid: 's2', itemId: 'healing-herb' as ItemId, cost: 2 },
  { uid: 's3', itemId: 'whetstone' as ItemId, cost: 2 },
  { uid: 's4', itemId: 'apple' as ItemId, cost: 1 },
  { uid: 's5', itemId: 'iron-dagger' as ItemId, cost: 3 },
];

describe('ShopPanel', () => {
  it('renders 5 shop slots, the reroll cost, and the Continue CTA', () => {
    render(
      <DndContext>
        <ShopPanel
          state={TEST_RUN_STATE}
          shop={TEST_SHOP}
          onReroll={vi.fn()}
          onContinue={vi.fn()}
          busy={false}
        />
      </DndContext>,
    );

    // Each seed item's name is rendered inside its ShopSlot card.
    expect(screen.getByText('Iron Sword')).toBeInTheDocument();
    expect(screen.getByText('Healing Herb')).toBeInTheDocument();
    expect(screen.getByText('Whetstone')).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Iron Dagger')).toBeInTheDocument();

    // Reroll button cost via sim's computeRerollCost — for the default
    // ruleset (rerollCostStart=1, rerollCostIncrement=1,
    // state.derived.extraRerollsPerRound=0) at rerollCount=0, the cost is 1.
    // Codex P1 fix on PR #6 routed UI affordability through the same
    // formula the reducer charges from; previous "rerollCount + 1"
    // happened to agree on default values.
    const rerollButton = screen.getByRole('button', { name: /REROLL/i });
    expect(rerollButton).toBeInTheDocument();
    expect(rerollButton).toHaveTextContent('1');

    // Continue CTA.
    expect(screen.getByRole('button', { name: /CONTINUE/i })).toBeInTheDocument();
  });

  it('disables the Continue CTA when combat is busy', () => {
    render(
      <DndContext>
        <ShopPanel
          state={TEST_RUN_STATE}
          shop={TEST_SHOP}
          onReroll={vi.fn()}
          onContinue={vi.fn()}
          busy={true}
        />
      </DndContext>,
    );
    const continueBtn = screen.getByRole('button', { name: /CONTINUE/i });
    expect(continueBtn).toBeDisabled();
  });
});
