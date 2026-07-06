// CF 57 — shared open-state + handlers for the item-info popover, used by the
// inner inspect <button> in both DraggableItem (bag) and ShopSlot (shop).
//
// The inspect trigger is a real <button> nested inside the dnd-kit drag node
// (CF 57 structural split): the outer element owns pointer-drag only, the button
// owns everything popover. Because it's a native button, Enter/Space activate it
// as a click for free — so this hook must NOT also provide an onKeyDown toggle,
// or the key would toggle twice (native click + manual handler).
//
// Rules:
//   • Click / Enter / Space toggle the popover (native button semantics).
//   • Fail-closed: when `enabled` is false the hook returns NO handlers and NO
//     ARIA, so the button carries no popover affordance (the caller also drops
//     it out of the tab order and closes any open popover).

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, HTMLAttributes } from 'react';

type TriggerHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  'onClick' | 'aria-haspopup' | 'aria-expanded'
>;

export interface ItemInfoTrigger {
  open: boolean;
  close: () => void;
  handlers: TriggerHandlers;
}

/** Reset style for the inner inspect <button> so it is a transparent, full-size
 *  click/focus layer that leaves the item's visual untouched. */
export const INSPECT_TRIGGER_STYLE: CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  padding: 0,
  margin: 0,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'inherit',
};

export function useItemInfoTrigger(enabled: boolean): ItemInfoTrigger {
  const [isOpen, setIsOpen] = useState(false);

  // Clear the open state whenever the trigger is disabled (combat / busy) so the
  // popover can't silently spring back when re-enabled (Codex P2). Reopening
  // requires a fresh activation.
  useEffect(() => {
    if (!enabled) setIsOpen(false);
  }, [enabled]);

  const open = enabled && isOpen;
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const handlers = useMemo<TriggerHandlers>(() => {
    if (!enabled) return {};
    return {
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      onClick: () => toggle(),
    };
  }, [enabled, open, toggle]);

  return { open, close, handlers };
}
