// M1.5b PR 3 / 5b.3b Step 3 — abandon-run UI surface.
//
// Single component owns three states (closed / menu / confirm) and two
// renders (desktop dialog / mobile bottom-sheet). Phase 1 ratification
// + locked v3 design:
//   - ⋯ trigger button (accessible label "Run options"), inserted by
//     TopBar (desktop after trophy + hairline divider) and MobileTopBar
//     (mobile, grouped with OpponentSilhouette in a right-side cluster).
//   - Desktop click ⋯ → 'menu' state (single-item dropdown on
//     surface-elev) → click "Abandon run" → 'confirm' state (centered
//     dialog with scrim, locked copy + buttons).
//   - Mobile click ⋯ → 'confirm' state direct, rendered as a bottom-
//     sheet (~35% / 295px of an 844-tall viewport) — sheet IS the
//     confirm surface (combines menu + confirm into one tap).
//   - Confirm copy (pinned, sentence case): title "Abandon this run?";
//     body "Your bag, relics, trophies, and contract progress will be
//     lost."; Cancel button "Keep playing" (filled accent #3B82F6,
//     auto-focused, Enter-triggered); Abandon button "Abandon run"
//     (neutral ghost — border-default #2D3854 / text-secondary
//     #94A3B8, hover→text-primary #F0F4FA, weight 500). NO #DC2626
//     destructive accent — destructive weight carried by the explicit-
//     loss copy + default-weighted Cancel per visual-direction.md § 3
//     + 2026-05-21 § 5b.3b open: #DC2626 destructive-accent REJECTED.
//   - A11y: focus trap inside confirm; Cancel auto-focused; Enter
//     triggers Cancel; Esc and scrim-click cancel; focus returns to
//     the ⋯ trigger on close.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRunContext } from './RunContext';
import { useViewport } from './useViewport';

type View = 'closed' | 'menu' | 'confirm';

const COPY = {
  title: 'Abandon this run?',
  body: 'Your bag, relics, trophies, and contract progress will be lost.',
  cancel: 'Keep playing',
  confirm: 'Abandon run',
  triggerLabel: 'Run options',
  menuItem: 'Abandon run',
} as const;

// Z-stack budget — coordinates with top-bar layering:
//   - TopBar / MobileTopBar: implicit z=0 (no explicit z-index)
//   - Scrim:                   z=200 (above top bar so click-outside
//                                     captures top-bar taps too)
//   - Menu dropdown:           z=210 (anchored to ⋯ in desktop top bar)
//   - Dialog / sheet:          z=220 (above scrim + menu)
//   - ⋯ trigger:               unchanged (lives in top bar; user can
//                                still see it through scrim translucency
//                                but it's behind the scrim — clicking
//                                where the trigger sits closes the menu
//                                via scrim-click handler)
const Z_SCRIM = 200;
const Z_MENU = 210;
const Z_DIALOG = 220;

export function AbandonRunMenu() {
  const { abandonRun } = useRunContext();
  const viewport = useViewport();
  const [view, setView] = useState<View>('closed');
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement | null>(null);
  const menuItemRef = useRef<HTMLButtonElement | null>(null);

  const close = useCallback(() => {
    setView('closed');
    // Defer focus return until after React commits the unmount.
    queueMicrotask(() => {
      triggerRef.current?.focus();
    });
  }, []);

  const openFromTrigger = useCallback(() => {
    // Desktop: two-step (menu → confirm). Mobile: one-step (sheet is
    // the confirm). Phase 1 + v3 design ratified.
    setView(viewport === 'mobile' ? 'confirm' : 'menu');
  }, [viewport]);

  const promoteToConfirm = useCallback(() => {
    setView('confirm');
  }, []);

  const onConfirmAbandon = useCallback(() => {
    abandonRun();
    // RunProvider's isRunEnded gate will unmount this component (the
    // top bar lives inside the in-run layout). setView noop here is
    // structurally safe — the component tree disappears next render.
  }, [abandonRun]);

  // Auto-focus + keyboard handling per ratified A11y:
  //   - Cancel auto-focused on 'confirm' state mount.
  //   - 'menu' state: focus the single menu item.
  //   - Esc closes from any open state.
  //   - Enter on confirm surface triggers Cancel (Cancel is default).
  //   - Focus trap: Tab/Shift+Tab cycle between the two confirm buttons.
  useEffect(() => {
    if (view === 'confirm') {
      cancelBtnRef.current?.focus();
    } else if (view === 'menu') {
      menuItemRef.current?.focus();
    }
  }, [view]);

  useEffect(() => {
    if (view === 'closed') return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (view === 'confirm') {
        if (e.key === 'Enter') {
          // Enter triggers the default Cancel — explicit per v3.
          e.preventDefault();
          close();
          return;
        }
        if (e.key === 'Tab') {
          const cancelEl = cancelBtnRef.current;
          const confirmEl = confirmBtnRef.current;
          if (!cancelEl || !confirmEl) return;
          const active = document.activeElement;
          if (e.shiftKey) {
            if (active === cancelEl) {
              e.preventDefault();
              confirmEl.focus();
            }
          } else {
            if (active === confirmEl) {
              e.preventDefault();
              cancelEl.focus();
            }
          }
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="abandon-trigger"
        aria-label={COPY.triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={view !== 'closed'}
        onClick={openFromTrigger}
        style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          color: 'var(--text-secondary)',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
        }}
      >
        ⋯
      </button>

      {view !== 'closed' ? (
        <>
          {/* Scrim — click-outside cancels. Sits ABOVE top bar so the
              tap area covers it too. Keyboard handling lives on window
              listener so the scrim doesn't need to capture key events. */}
          <div
            data-testid="abandon-scrim"
            onClick={close}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(11, 15, 26, 0.5)',
              zIndex: Z_SCRIM,
            }}
          />
          {view === 'menu' ? <DesktopMenu /> : null}
          {view === 'confirm' && viewport === 'desktop' ? <DesktopDialog /> : null}
          {view === 'confirm' && viewport === 'mobile' ? <MobileSheet /> : null}
        </>
      ) : null}
    </>
  );

  function DesktopMenu() {
    return (
      <div
        data-testid="abandon-menu"
        role="menu"
        style={{
          position: 'fixed',
          // Anchor near top-right; the trigger lives in TopBar's right
          // cluster. Fixed-positioned for simplicity (a portaled anchor
          // would be cleaner but the top bar is 48px so a fixed-top
          // offset matches every screen the in-run layout reaches).
          top: 56,
          right: 20,
          minWidth: 180,
          background: 'var(--surface-elev)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: 6,
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          zIndex: Z_MENU,
        }}
      >
        <button
          ref={menuItemRef}
          type="button"
          role="menuitem"
          data-testid="abandon-menuitem"
          onClick={promoteToConfirm}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            padding: '10px 12px',
            borderRadius: 6,
            textAlign: 'left',
            fontSize: 14,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background =
              'rgba(255,255,255,0.04)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          {COPY.menuItem}
        </button>
      </div>
    );
  }

  function DesktopDialog() {
    return (
      <div
        data-testid="abandon-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abandon-title"
        aria-describedby="abandon-body"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          minWidth: 380,
          maxWidth: 440,
          background: 'var(--surface-elev)',
          border: '1px solid var(--border-default)',
          borderRadius: 10,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          zIndex: Z_DIALOG,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        <ConfirmContent
          cancelRef={(el) => {
            cancelBtnRef.current = el;
          }}
          confirmRef={(el) => {
            confirmBtnRef.current = el;
          }}
          onCancel={close}
          onConfirm={onConfirmAbandon}
        />
      </div>
    );
  }

  function MobileSheet() {
    return (
      <div
        data-testid="abandon-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abandon-title"
        aria-describedby="abandon-body"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          // ~35% of 844px = ~295px per v3 design; min ensures touch
          // targets remain comfortable on shorter viewports.
          minHeight: 'min(35vh, 295px)',
          background: 'var(--surface-elev)',
          borderTopLeftRadius: 14,
          borderTopRightRadius: 14,
          padding: '20px 18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          zIndex: Z_DIALOG,
          boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
        }}
      >
        <ConfirmContent
          cancelRef={(el) => {
            cancelBtnRef.current = el;
          }}
          confirmRef={(el) => {
            confirmBtnRef.current = el;
          }}
          onCancel={close}
          onConfirm={onConfirmAbandon}
        />
      </div>
    );
  }
}

function ConfirmContent({
  cancelRef,
  confirmRef,
  onCancel,
  onConfirm,
}: {
  cancelRef: (el: HTMLButtonElement | null) => void;
  confirmRef: (el: HTMLButtonElement | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div
        id="abandon-title"
        data-testid="abandon-title"
        style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}
      >
        {COPY.title}
      </div>
      <div
        id="abandon-body"
        data-testid="abandon-body"
        style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}
      >
        {COPY.body}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
        <button
          ref={confirmRef}
          type="button"
          data-testid="abandon-confirm"
          onClick={onConfirm}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)',
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          }}
        >
          {COPY.confirm}
        </button>
        <button
          ref={cancelRef}
          type="button"
          data-testid="abandon-cancel"
          onClick={onCancel}
          style={{
            background: 'var(--accent)',
            border: '1px solid var(--accent)',
            color: '#ffffff',
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {COPY.cancel}
        </button>
      </div>
    </>
  );
}
