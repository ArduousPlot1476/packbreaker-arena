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

  it('renders Rune Pedestal’s trigger_chance_pct buff line (CF 58)', () => {
    render(<Harness itemId="rune-pedestal" />);
    const popover = screen.getByTestId('item-info-popover');
    expect(popover).toHaveTextContent('Rune Pedestal');
    expect(popover).toHaveTextContent('nearby gem/consumable items +20% trigger chance');
  });

  it('keeps real effects AND renders the proc-buff line (Master Alchemist’s Kit, CF 58)', () => {
    render(<Harness itemId="master-alchemists-kit" />);
    const popover = screen.getByTestId('item-info-popover');
    expect(popover).toHaveTextContent('poison 3 to enemy');
    expect(popover).toHaveTextContent('nearby consumable/gem items +30% trigger chance');
  });
});
