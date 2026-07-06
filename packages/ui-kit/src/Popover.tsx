// Generic, content-agnostic popover primitive (CF 57). Renders its children in
// a portaled, positioned, focus-trapped dialog anchored to a trigger element.
// It knows NOTHING about Items — apps/client wraps it (ItemInfoPopover) to feed
// derived item text in. ui-kit ships no CSS layer, so visuals use the app's
// locked palette custom properties (var(--surface), etc.) inline, exactly as
// RarityFrame does.
//
// Rule 12 (decision-log.md 2026-05-21) interactive-overlay contract, owned here:
//   • role="dialog" + aria-label; focus trap in both Tab directions
//   • auto-focus the dialog on open; return focus to the trigger on every close
//     path (Esc / tap-away / re-trigger — the scrim intercepts a re-tap)
//   • Esc cancels; transparent scrim carries aria-hidden
//   • no global key hijack (only Tab/Esc are handled, on the dialog)
// The trigger-side ARIA (aria-haspopup / aria-expanded) + focus-visible ring
// belong to the trigger element, which this primitive does not own.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** Trigger element the dialog anchors to + returns focus to on close. */
  anchorRef: RefObject<HTMLElement | null>;
  /** Accessible name for the dialog (role="dialog"). */
  ariaLabel?: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}

export function Popover({
  open,
  onClose,
  anchorRef,
  ariaLabel,
  className,
  testId = 'popover',
  children,
}: PopoverProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Position after render (pre-paint) so we can measure the dialog and clamp it
  // into the viewport without a visible flash. Prefer below the anchor, flip
  // above when there isn't room.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    const dialog = dialogRef.current;
    if (!anchor || !dialog) return;
    const a = anchor.getBoundingClientRect();
    const d = dialog.getBoundingClientRect();
    const gap = 8;
    const vw = window.innerWidth || 0;
    const vh = window.innerHeight || 0;
    let left = a.left;
    if (vw > 0 && left + d.width > vw - gap) left = Math.max(gap, vw - gap - d.width);
    if (left < gap) left = gap;
    let top = a.bottom + gap;
    if (vh > 0 && top + d.height > vh - gap && a.top - gap - d.height >= gap) {
      top = a.top - gap - d.height;
    }
    if (top < gap) top = gap;
    setPos({ top, left });
  }, [open, anchorRef]);

  // Auto-focus the dialog on open; return focus to the trigger on close/unmount.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      const target = anchorRef.current ?? previouslyFocused;
      target?.focus?.();
    };
  }, [open, anchorRef]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // Focus trap: wrap Tab / Shift+Tab within the dialog. With no focusable
      // children (a text-only popover), keep focus pinned on the dialog itself.
      const focusables = focusableWithin(dialogRef.current);
      if (focusables.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onPointerDown={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={ariaLabel}
        tabIndex={-1}
        data-testid={testId}
        className={className}
        onKeyDown={onKeyDown}
        style={{
          position: 'fixed',
          top: pos?.top ?? 0,
          left: pos?.left ?? 0,
          visibility: pos ? 'visible' : 'hidden',
          zIndex: 41,
          maxWidth: 'min(280px, calc(100vw - 16px))',
          background: 'var(--surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          padding: 10,
          color: 'var(--text-primary)',
          outline: 'none',
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
