// CF 57 — DraggableItem structural split. The inspect trigger is an inner
// <button> nested in the dnd drag node. Covers: the accessible name, the Rule 12
// focus contract at the combat-disable transition, and — critically — that a
// pointerdown starting on the inner button still propagates to the outer drag
// node (so dragging works from anywhere on the item).

import { describe, expect, it, vi } from 'vitest';
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

describe('DraggableItem — inspect button (CF 57 structural split)', () => {
  it('the inner button carries the item name and aria-haspopup (Codex F2)', () => {
    render(tree(false));
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('aria-label')).toBe('Iron Sword');
  });

  it('the outer drag node is NOT interactive (no role=button / nested-interactive)', () => {
    const { container } = render(tree(false));
    // Outer drag node is the element carrying the grab cursor.
    const dragNode = container.querySelector('[style*="cursor: grab"]') as HTMLElement;
    expect(dragNode.getAttribute('role')).toBeNull();
    // The interactive element is the inner button, nested inside the drag node.
    const button = dragNode.querySelector('button');
    expect(button).not.toBeNull();
  });

  it('tap opens + auto-focuses the dialog; disabling mid-open closes it and returns focus to the button', () => {
    const { rerender } = render(tree(false));
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;

    fireEvent.click(button);
    const dialog = screen.getByTestId('item-info-popover');
    expect(dialog).toBeInTheDocument();
    expect(document.activeElement).toBe(dialog);

    // Combat starts: the item flips to disabled while the popover is open.
    rerender(tree(true));
    expect(screen.queryByTestId('item-info-popover')).toBeNull();
    // Focus returns to the same button (still focusable via tabIndex=-1).
    expect(document.activeElement).toBe(button);
  });

  it('a pointerdown on the inner button propagates to the drag node (drag works from over the button)', () => {
    const spy = vi.fn();
    render(
      <div onPointerDown={spy}>
        <DndContext>
          <DraggableItem item={ITEM} disabled={false} enableInfoPopover />
        </DndContext>
      </div>,
    );
    const button = document.querySelector('[aria-haspopup="dialog"]') as HTMLElement;
    fireEvent.pointerDown(button);
    // The button does not stop propagation, so the pointerdown reaches the drag
    // node's dnd listeners (which sit between the button and this spy).
    expect(spy).toHaveBeenCalled();
  });
});
