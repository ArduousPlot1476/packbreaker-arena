// CF 57 — shared trigger interaction for the item-info popover, used by both
// DraggableItem (bag) and ShopSlot (shop) so the gesture rules live in one
// place.
//
// Rules:
//   • TAP / CLICK is the path in, and works on both viewports (a <4px tap does
//     not start a @dnd-kit drag, so the click lands as a toggle).
//   • Enter/Space toggle from the keyboard (the trigger is already role=button,
//     tabindex=0 via @dnd-kit attributes).
//   • Fail-closed: when `enabled` is false the hook returns NO handlers and NO
//     ARIA, so a component reused without opting in silently has no popover.
//
// Hover-open was removed in CF 57 Phase 2.5 (Codex P1): the modal Popover mounts
// a full-screen scrim that consumes the next pointerdown, so a desktop
// hover-open would swallow the press that starts a @dnd-kit drag. Tap/click is
// the primary path on both viewports and is unaffected.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HTMLAttributes } from 'react';

type TriggerHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  'onClick' | 'onKeyDown' | 'aria-haspopup' | 'aria-expanded'
>;

export interface ItemInfoTrigger {
  open: boolean;
  close: () => void;
  handlers: TriggerHandlers;
}

export function useItemInfoTrigger(enabled: boolean): ItemInfoTrigger {
  const [isOpen, setIsOpen] = useState(false);

  // Clear the open state whenever the trigger is disabled (CF 57 Phase 2.5 /
  // Codex P2). Without this, `open` would merely be masked by `enabled` while
  // disabled and then silently spring back when re-enabled — e.g. an open bag
  // popover would reappear on its own when combat ends. Reopening requires a
  // fresh tap.
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
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      },
    };
  }, [enabled, open, toggle]);

  return { open, close, handlers };
}
