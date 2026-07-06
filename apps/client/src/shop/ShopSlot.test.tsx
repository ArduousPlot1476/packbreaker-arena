// CF 57 Phase 2.5 F3 — shop info-popover combat gating. The popover is gated on
// !busy (combat) mirroring the bag's !disabled, but affordability is a SEPARATE
// gate: an unaffordable-but-not-busy slot stays inspectable.

import { describe, expect, it } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ItemId, ShopSlot as ShopSlotData } from '../run/types';
import { ShopSlot } from './ShopSlot';

const SLOT: ShopSlotData = { uid: 's1', itemId: 'iron-sword' as ItemId, cost: 3 };

function tree(gold: number, busy: boolean) {
  return (
    <DndContext>
      <ShopSlot slot={SLOT} gold={gold} busy={busy} enableInfoPopover />
    </DndContext>
  );
}

describe('ShopSlot — info popover combat gating (Codex F3)', () => {
  it('affordable + not busy: tap opens the popover', () => {
    render(tree(10, false));
    const trigger = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger);
    expect(screen.getByTestId('item-info-popover')).toBeInTheDocument();
  });

  it('busy (combat): no trigger, and interaction does not open a dialog', () => {
    const { container } = render(tree(10, true));
    expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
    fireEvent.click(screen.getByText('Iron Sword'));
    expect(screen.queryByTestId('item-info-popover')).toBeNull();
  });

  it('unaffordable but NOT busy: inspectable AND not announced disabled (F4)', () => {
    render(tree(0, false));
    const trigger = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    expect(trigger).not.toBeNull();
    // Un-draggable (can't afford) but the info trigger is operable, so it must
    // not carry aria-disabled="true" — otherwise AT hides the inspect path.
    expect(trigger.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(trigger);
    expect(screen.getByTestId('item-info-popover')).toBeInTheDocument();
  });

  it('busy: dnd aria-disabled passes through (control is genuinely disabled)', () => {
    const { container } = render(tree(10, true));
    // No popover trigger during combat; the card is the disabled draggable.
    expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
    const card = screen.getByText('Iron Sword').closest('[aria-disabled]');
    expect(card?.getAttribute('aria-disabled')).toBe('true');
  });

  it('busy flips true while open: popover closes and focus returns to the slot', () => {
    const { rerender } = render(tree(10, false));
    const trigger = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    fireEvent.click(trigger);
    expect(screen.getByTestId('item-info-popover')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('item-info-popover'));

    rerender(tree(10, true));
    expect(screen.queryByTestId('item-info-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
