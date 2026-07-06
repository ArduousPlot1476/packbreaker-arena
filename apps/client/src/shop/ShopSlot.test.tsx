// CF 57 — ShopSlot structural split. The inspect trigger is an inner <button>
// nested in the dnd drag node. Because inspect-availability (combat/busy) and
// drag-availability (affordability) now live on two separate elements, the
// unaffordable-but-inspectable slot needs no aria-disabled override — the button
// simply never carries a disabled state (Codex F3 + F4 become structural).

import { describe, expect, it, vi } from 'vitest';
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

describe('ShopSlot — inspect button (CF 57 structural split)', () => {
  it('affordable + not busy: the inner button opens the popover', () => {
    render(tree(10, false));
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(screen.getByTestId('item-info-popover')).toBeInTheDocument();
  });

  it('accessible name includes item name AND cost (purchase-decision context)', () => {
    render(tree(10, false));
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    // SLOT.cost === 3; "gold" mirrors the coin-glyph cost display.
    expect(button.getAttribute('aria-label')).toBe('Iron Sword — 3 gold');
  });

  it('busy (combat): no popover affordance, and interaction opens nothing (F3)', () => {
    const { container } = render(tree(10, true));
    expect(container.querySelector('[aria-haspopup="dialog"]')).toBeNull();
    fireEvent.click(screen.getByText('Iron Sword'));
    expect(screen.queryByTestId('item-info-popover')).toBeNull();
  });

  it('unaffordable but NOT busy: inspectable AND never announced disabled (F4 is now structural)', () => {
    render(tree(0, false));
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    expect(button).not.toBeNull();
    // The inspect button lives on a different element than the drag-disabled
    // state, so it simply carries no aria-disabled at all.
    expect(button.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(button);
    expect(screen.getByTestId('item-info-popover')).toBeInTheDocument();
  });

  it('busy flips true while open: popover closes and focus returns to the button', () => {
    const { rerender } = render(tree(10, false));
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    fireEvent.click(button);
    expect(screen.getByTestId('item-info-popover')).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByTestId('item-info-popover'));

    rerender(tree(10, true));
    expect(screen.queryByTestId('item-info-popover')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('a pointerdown on the inner button propagates to the drag node (drag works from over the button)', () => {
    const spy = vi.fn();
    render(
      <div onPointerDown={spy}>
        <DndContext>
          <ShopSlot slot={SLOT} gold={10} busy={false} enableInfoPopover />
        </DndContext>
      </div>,
    );
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    fireEvent.pointerDown(button);
    expect(spy).toHaveBeenCalled();
  });
});
