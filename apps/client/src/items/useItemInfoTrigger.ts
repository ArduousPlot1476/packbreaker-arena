// CF 57 — shared trigger interaction for the item-info popover, used by both
// DraggableItem (bag) and ShopSlot (shop) so the gesture rules live in one
// place.
//
// Rules:
//   • TAP / CLICK is the primary path and works on both viewports (a <4px tap
//     does not start a @dnd-kit drag, so the click lands as a toggle).
//   • Enter/Space toggle from the keyboard (the trigger is already role=button,
//     tabindex=0 via @dnd-kit attributes).
//   • HOVER is a desktop-only progressive enhancement — attached ONLY on
//     hover-capable pointers, and it never becomes the sole path in (tap always
//     works). A hover-open closes on mouse-leave; a tap-open stays pinned until
//     dismissed (Esc / tap-away).
//   • Fail-closed: when `enabled` is false the hook returns NO handlers and NO
//     ARIA, so a component reused without opting in silently has no popover.

import { useCallback, useMemo, useState } from 'react';
import type { HTMLAttributes } from 'react';

type TriggerHandlers = Pick<
  HTMLAttributes<HTMLElement>,
  'onClick' | 'onKeyDown' | 'onMouseEnter' | 'onMouseLeave' | 'aria-haspopup' | 'aria-expanded'
>;

export interface ItemInfoTrigger {
  open: boolean;
  close: () => void;
  handlers: TriggerHandlers;
}

export function useItemInfoTrigger(enabled: boolean): ItemInfoTrigger {
  const [reason, setReason] = useState<'tap' | 'hover' | null>(null);
  const canHover = useMemo(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: hover)').matches,
    [],
  );

  const open = enabled && reason !== null;
  const close = useCallback(() => setReason(null), []);
  const toggleTap = useCallback(
    () => setReason((prev) => (prev === 'tap' ? null : 'tap')),
    [],
  );

  const handlers = useMemo<TriggerHandlers>(() => {
    if (!enabled) return {};
    return {
      'aria-haspopup': 'dialog',
      'aria-expanded': open,
      onClick: () => toggleTap(),
      onKeyDown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleTap();
        }
      },
      onMouseEnter: canHover
        ? () => setReason((prev) => (prev === null ? 'hover' : prev))
        : undefined,
      onMouseLeave: canHover
        ? () => setReason((prev) => (prev === 'hover' ? null : prev))
        : undefined,
    };
  }, [enabled, open, canHover, toggleTap]);

  return { open, close, handlers };
}
