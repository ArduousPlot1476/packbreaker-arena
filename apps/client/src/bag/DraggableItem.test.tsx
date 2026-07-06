// CF 57 Phase 2.5g — Rule 12 focus contract at the exact transition the P1/P2
// fixes touch: popover open (tap) → the item is disabled mid-open (combat
// starts). The popover must close AND focus must return to the still-mounted
// (now-disabled) item, not silently no-op to <body>.

import { describe, expect, it } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { fireEvent, render, screen } from '@testing-library/react';
import type { BagItem, ItemId } from '../run/types';
import { DraggableItem } from './DraggableItem';

const ITEM: BagItem = { uid: 'b1', itemId: 'iron-sword' as ItemId, col: 0, row: 0, rot: 0 };

function tree(disabled: boolean) {
  return (
    <DndContext>
      <DraggableItem item={ITEM} disabled={disabled} enableInfoPopover />
    </DndContext>
  );
}

describe('DraggableItem — info popover focus across combat disable (Rule 12)', () => {
  it('tap opens + auto-focuses the dialog; disabling mid-open closes it and returns focus to the item', () => {
    const { rerender } = render(tree(false));

    // The bag item is the trigger; it carries aria-haspopup while enabled.
    const trigger = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    expect(trigger).not.toBeNull();

    fireEvent.click(trigger);
    const dialog = screen.getByTestId('item-info-popover');
    expect(dialog).toBeInTheDocument();
    expect(document.activeElement).toBe(dialog);

    // Combat starts: the item flips to disabled while the popover is open.
    rerender(tree(true));

    // Popover closes, and focus returns to the still-mounted item (not lost to body).
    expect(screen.queryByTestId('item-info-popover')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('gives the icon-only bag trigger an accessible name (Codex F2)', () => {
    render(tree(false));
    const trigger = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    expect(trigger.getAttribute('aria-label')).toBe('Iron Sword');
  });
});
