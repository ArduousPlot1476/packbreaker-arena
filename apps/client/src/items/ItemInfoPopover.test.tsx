// CF 57 — ItemInfoPopover integration: resolves the canonical Item, derives
// terse lines, renders them (with the item name) inside the ui-kit Popover.

import { useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ItemId } from '@packbreaker/content';
import { ItemInfoPopover } from './ItemInfoPopover';

function Harness({ itemId }: { itemId: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={ref} data-testid="trigger">
        trigger
      </button>
      <ItemInfoPopover
        itemId={itemId as ItemId}
        open
        onClose={() => {}}
        anchorRef={ref}
      />
    </>
  );
}

describe('ItemInfoPopover', () => {
  it('renders the item name + derived terse lines (iron-sword)', () => {
    render(<Harness itemId="iron-sword" />);
    const popover = screen.getByTestId('item-info-popover');
    expect(popover).toHaveTextContent('Iron Sword');
    expect(popover).toHaveTextContent('Every 5s — 4 dmg to enemy');
  });

  it('shows the structural tag fallback for Rune Pedestal (inert-only item)', () => {
    render(<Harness itemId="rune-pedestal" />);
    const popover = screen.getByTestId('item-info-popover');
    expect(popover).toHaveTextContent('Rune Pedestal');
    expect(popover).toHaveTextContent('Tool · Gem');
    expect(popover.textContent ?? '').not.toMatch(/trigger|chance/i);
  });

  it('omits the inert proc-buff line but keeps real effects (Master Alchemist’s Kit)', () => {
    render(<Harness itemId="master-alchemists-kit" />);
    const popover = screen.getByTestId('item-info-popover');
    expect(popover).toHaveTextContent('poison 3 to enemy');
    expect(popover.textContent ?? '').not.toMatch(/trigger|chance/i);
  });
});
