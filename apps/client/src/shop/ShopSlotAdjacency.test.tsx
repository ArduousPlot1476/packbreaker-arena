// CF-95b — the mark on the real shop surface, end to end.
//
// The predicate is unit-tested against the registry in
// items/hasAdjacencyMechanic.test.ts; this proves the SHOP CARD actually wires
// it, which is a separate failure mode: the card reads `ITEMS` from
// run/content.ts, whose adaptItem STRIPS `triggers`. A card wired to `def`
// instead of the canonical item type-checks, renders, and silently marks
// nothing at all. That is the regression this file exists to catch.

import { describe, expect, it } from 'vitest';
import { DndContext } from '@dnd-kit/core';
import { render } from '@testing-library/react';
import type { ItemId, ShopSlot as ShopSlotData } from '../run/types';
import { ShopSlot } from './ShopSlot';

function card(itemId: string) {
  const slot: ShopSlotData = { uid: 's1', itemId: itemId as ItemId, cost: 3 };
  return render(
    <DndContext>
      <ShopSlot slot={slot} gold={99} busy={false} enableInfoPopover />
    </DndContext>,
  );
}

/** Query SCOPED to one render's container — testing-library binds queries to
 *  document.body, so a test rendering two cards would match both trees. */
const markIn = (r: ReturnType<typeof card>): HTMLElement | null =>
  r.container.querySelector('[data-testid="adjacency-mark"]');

describe('ShopSlot — adjacency mark reaches the card face', () => {
  it.each([
    ['whetstone', '1x1, reacts + emits'],
    ['mana-potion', '1x1, emits from on_round_start'],
    ['spark-stone', '1x1, reacts, emits status not a buff'],
    ['forge-anvil', '2x2 — the shape a side-band mark could not have served'],
    ['berserkers-greataxe', '2x2, emits from on_low_health'],
    ['master-alchemists-kit', '2x2, reacts + emits'],
  ])('marks %s (%s)', (itemId) => {
    const { queryByTestId } = card(itemId);
    expect(queryByTestId('adjacency-mark')).not.toBeNull();
  });

  it.each([
    ['iron-sword', 'plain weapon'],
    ['buckler', 'pure passive'],
    ['copper-coin', 'economy'],
    ['apple', 'self-heal'],
    ['bloodmoon-plate', 'epic WITHOUT a cross-item mechanic — rarity is not the signal'],
  ])('does NOT mark %s (%s)', (itemId) => {
    const { queryByTestId } = card(itemId);
    expect(queryByTestId('adjacency-mark')).toBeNull();
  });

  it('the mark scales with the frame, not with the card: 8px at the shop size 42', () => {
    const { getByTestId } = card('whetstone');
    expect(getByTestId('adjacency-mark').style.width).toBe('8px');
  });

  it('a 2x2 item gets the SAME 8px mark as a 1x1 — scale-invariant by placement', () => {
    // The rejected side-band placement collapsed to 4px at 2x2, which is
    // exactly forge-anvil / berserkers-greataxe / master-alchemists-kit.
    // Corner placement is indifferent to footprint; this pins that.
    const oneByOne = markIn(card('whetstone'));
    const twoByTwo = markIn(card('forge-anvil'));
    expect(oneByOne?.style.width).toBe('8px');
    expect(twoByTwo?.style.width).toBe('8px');
  });

  it('SOLD slots render no card and therefore no mark', () => {
    const slot: ShopSlotData = { uid: 's1', itemId: null, cost: 0 };
    const { queryByTestId } = render(
      <DndContext>
        <ShopSlot slot={slot} gold={99} busy={false} enableInfoPopover />
      </DndContext>,
    );
    expect(queryByTestId('adjacency-mark')).toBeNull();
  });
});
