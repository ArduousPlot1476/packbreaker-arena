// ShopPanel smoke test: 5 slots + reroll cost + Continue CTA.
// Wrapped in DndContext because each ShopSlot uses @dnd-kit's
// useDraggable and the SellZone uses useDroppable.

import { describe, expect, it, vi } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { render, screen } from '@testing-library/react';
import { INITIAL, SEED_SHOP } from '../data.local';
import { ShopPanel } from './ShopPanel';

describe('ShopPanel', () => {
  it('renders 5 shop slots, the reroll cost, and the Continue CTA', () => {
    render(
      <DndContext>
        <ShopPanel
          state={INITIAL}
          shop={SEED_SHOP}
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

    // Reroll button: cost = rerollCount + 1 = 1 at INITIAL.
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
          state={INITIAL}
          shop={SEED_SHOP}
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
