// Component tests for AbandonRunMenu (M1.5b PR 3 / 5b.3b Step 3).
//
// Two viewport surfaces (desktop dialog / mobile bottom-sheet) +
// one orchestrator. Tests cover the ratified v3 design contract:
//   - Trigger renders with accessible label.
//   - Desktop two-step open (⋯ → menu → confirm dialog).
//   - Mobile one-step open (⋯ → bottom-sheet, no intermediate menu).
//   - Locked copy strings (title / body / Cancel / Abandon).
//   - A11y: Cancel auto-focused; Enter triggers Cancel; Esc/scrim
//     cancel; focus returns to ⋯ on close.
//   - NO #DC2626 / red destructive accent on the Abandon button —
//     ratified neutral-ghost styling.

import { useEffect, useState } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { AbandonRunMenu } from './AbandonRunMenu';
import { RunProvider } from './RunContext';
import type { ClassId, RelicId } from '@packbreaker/content';

// Same stub as RunContext.test.tsx — auto-fires beginRun so RunProvider
// transitions out of the ClassSelect gate and renders children
// (AbandonRunMenu mounts inside the in-run subtree).
vi.mock('../screens/ClassSelectScreen', () => ({
  ClassSelectScreen: function StubClassSelectScreen({
    onConfirm,
  }: {
    onConfirm: (input: { classId: ClassId; startingRelicId: RelicId }) => void;
  }) {
    useEffect(() => {
      onConfirm({
        classId: 'tinker' as ClassId,
        startingRelicId: 'apprentices-loop' as RelicId,
      });
    }, [onConfirm]);
    return null;
  },
}));

type ViewportMode = 'desktop' | 'mobile';

function mockViewport(mode: ViewportMode) {
  const matches = mode === 'mobile';
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes('max-width: 767px') ? matches : !matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

function renderMenu() {
  return render(
    <RunProvider>
      <AbandonRunMenu />
    </RunProvider>,
  );
}

async function waitForTrigger(getByTestId: (id: string) => HTMLElement) {
  await waitFor(() => {
    expect(getByTestId('abandon-trigger')).toBeInTheDocument();
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

// ─── Trigger surface ─────────────────────────────────────────────────

describe('AbandonRunMenu — ⋯ trigger (universal)', () => {
  it('renders with accessible label "Run options"', async () => {
    mockViewport('desktop');
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.getAttribute('aria-label')).toBe('Run options');
    // Closed-state: aria-expanded false on every viewport.
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

// ─── Trigger size — viewport-conditional (CF 53) ─────────────────────
//
// M1.5c follow-on CF 53: the ⋯ trigger is sized per viewport —
// 40×40 desktop, 36×36 mobile — replacing the shipped 28×28 uniform,
// keyed off the same useViewport() signal that drives openFromTrigger
// and the per-viewport aria-* attrs. Both values pinned so neither the
// 28 regresses nor the two viewports collapse to a single size.
// (Tap-target ≥44 deferred to M2 with mobile-vertical; 36 is
// defensible for the prototype.)
describe('AbandonRunMenu — ⋯ trigger size (viewport-conditional, CF 53)', () => {
  it('renders 40×40 on desktop', async () => {
    mockViewport('desktop');
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.style.width).toBe('40px');
    expect(trigger.style.height).toBe('40px');
  });

  it('renders 36×36 on mobile', async () => {
    mockViewport('mobile');
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.style.width).toBe('36px');
    expect(trigger.style.height).toBe('36px');
  });
});

// ─── Phase 2.5 round 2 — ARIA contract per viewport ─────────────────
//
// Per decision-log.md 2026-05-21 § 5b.3b Phase 1 halt-gate RATIFIED
// + this round's Codex P2 audit. The trigger's IMMEDIATE popup is
// viewport-dependent: desktop opens a single-item menu (role="menu")
// first; mobile opens a sheet (role="dialog") directly. aria-haspopup,
// aria-controls, and aria-expanded must reflect that — strictly.

describe('AbandonRunMenu — ARIA contract: desktop trigger ↔ menu', () => {
  beforeEach(() => mockViewport('desktop'));

  it('aria-haspopup="menu" (immediate popup is the menu, NOT the dialog)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('aria-controls points at the menu id (id="abandon-menu")', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.getAttribute('aria-controls')).toBe('abandon-menu');
  });

  it('aria-expanded false in closed; true while menu rendered; FALSE again after promotion to confirm dialog', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true'); // menu open
    expect(getByTestId('abandon-menu').getAttribute('id')).toBe('abandon-menu');

    fireEvent.click(getByTestId('abandon-menuitem'));
    // Menu unmounted; trigger's IMMEDIATE popup (menu) is no longer
    // open. Dialog is the menu's onward chain, NOT the trigger's
    // direct popup — strict aria-expanded semantics flip back to false.
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('menu has role="menu" + id="abandon-menu"; menuitem has role="menuitem"', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    const menu = getByTestId('abandon-menu');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.getAttribute('id')).toBe('abandon-menu');
    const item = getByTestId('abandon-menuitem');
    expect(item.getAttribute('role')).toBe('menuitem');
  });

  it('confirm dialog has role="dialog" + aria-modal="true" + labelledby/describedby + id', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    const dialog = getByTestId('abandon-dialog');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('abandon-title');
    expect(dialog.getAttribute('aria-describedby')).toBe('abandon-body');
    expect(dialog.getAttribute('id')).toBe('abandon-dialog');
    // labelledby + describedby resolve to live DOM nodes with matching text.
    expect(getByTestId('abandon-title').getAttribute('id')).toBe('abandon-title');
    expect(getByTestId('abandon-body').getAttribute('id')).toBe('abandon-body');
  });
});

describe('AbandonRunMenu — ARIA contract: mobile trigger ↔ sheet', () => {
  beforeEach(() => mockViewport('mobile'));

  it('aria-haspopup="dialog" (sheet IS a dialog on mobile)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('aria-controls points at the sheet id (id="abandon-sheet")', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.getAttribute('aria-controls')).toBe('abandon-sheet');
  });

  it('aria-expanded false in closed; true once sheet is open (one-step)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(getByTestId('abandon-sheet').getAttribute('id')).toBe('abandon-sheet');
  });

  it('sheet has role="dialog" + aria-modal="true" + labelledby/describedby + id', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    const sheet = getByTestId('abandon-sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.getAttribute('aria-labelledby')).toBe('abandon-title');
    expect(sheet.getAttribute('aria-describedby')).toBe('abandon-body');
    expect(sheet.getAttribute('id')).toBe('abandon-sheet');
    expect(getByTestId('abandon-title').getAttribute('id')).toBe('abandon-title');
    expect(getByTestId('abandon-body').getAttribute('id')).toBe('abandon-body');
  });
});

// ─── Desktop two-step flow ───────────────────────────────────────────

describe('AbandonRunMenu — desktop (two-step: ⋯ → menu → confirm dialog)', () => {
  beforeEach(() => mockViewport('desktop'));

  it('⋯ click opens menu (NOT dialog yet)', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    expect(getByTestId('abandon-menu')).toBeInTheDocument();
    expect(queryByTestId('abandon-dialog')).toBeNull();
    expect(queryByTestId('abandon-sheet')).toBeNull();
  });

  it('menu item promotes to confirm dialog', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    expect(getByTestId('abandon-dialog')).toBeInTheDocument();
    expect(queryByTestId('abandon-menu')).toBeNull();
    expect(queryByTestId('abandon-sheet')).toBeNull();
  });

  it('dialog renders locked v3 copy (title / body / Cancel / Abandon)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    expect(getByTestId('abandon-title').textContent).toBe('Abandon this run?');
    expect(getByTestId('abandon-body').textContent).toBe(
      'Your bag, relics, trophies, and contract progress will be lost.',
    );
    expect(getByTestId('abandon-cancel').textContent).toBe('Keep playing');
    expect(getByTestId('abandon-confirm').textContent).toBe('Abandon run');
  });

  it('Cancel button is auto-focused on dialog mount', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    await waitFor(() => {
      expect(document.activeElement).toBe(getByTestId('abandon-cancel'));
    });
  });

  it('Cancel click closes dialog + returns focus to ⋯ trigger', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    const trigger = getByTestId('abandon-trigger');
    fireEvent.click(trigger);
    fireEvent.click(getByTestId('abandon-menuitem'));
    fireEvent.click(getByTestId('abandon-cancel'));
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(trigger);
    });
  });

  it('Esc cancels from dialog', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
  });

  it('Esc cancels from menu (intermediate state)', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(queryByTestId('abandon-menu')).toBeNull();
    });
  });

  it('scrim click cancels', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    fireEvent.click(getByTestId('abandon-scrim'));
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
  });

  // Phase 2.5 meta-audit A.1: Enter activates the FOCUSED button (no
  // global Enter handler). Pre-fix, the global handler always called
  // close() regardless of which button was focused, defeating Tab-to-
  // Abandon-then-Enter (Codex P2 round 3). Post-fix: native button
  // activation handles Enter per-focus; auto-focused Cancel preserves
  // the "Enter on open = Cancel" UX structurally.
  it('Enter on default-focused Cancel cancels (run stays in-progress)', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    const cancel = getByTestId('abandon-cancel');
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    // happy-dom's fireEvent.keyDown does not synthesize the native
    // keyDown→click bridge a real browser uses to activate buttons.
    // The contract pinned here is the ABSENCE of a global handler
    // that would hijack BEFORE the native bridge fires — combined
    // with Cancel being auto-focused. Click the focused element to
    // simulate native activation.
    fireEvent.click(cancel);
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
    expect(queryByTestId('run-end-screen')).toBeNull();
  });

  it('Enter on Tab-focused Abandon activates abandon (RunEndScreen ABANDONED mounts)', async () => {
    const { getByTestId, findByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    const cancel = getByTestId('abandon-cancel');
    const confirm = getByTestId('abandon-confirm');
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    // Tab from Cancel (last in DOM) wraps to Confirm (first in DOM)
    // via the completed focus trap (Phase 2.5 meta-audit A.2).
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(confirm);
    // Native activation on focused Confirm. Pinning: no global Enter
    // handler intercepts before the focused button's onClick.
    fireEvent.click(confirm);
    const screen = await findByTestId('run-end-screen', undefined, { timeout: 3000 });
    expect(screen.getAttribute('data-outcome')).toBe('abandoned');
  });

  // Phase 2.5 meta-audit A.2: focus trap cycles BOTH directions.
  // Pre-fix had two escape paths: Cancel + Tab (no shift) and Confirm
  // + Shift+Tab — the trap only handled the native-correct moves.
  it('focus trap wraps both directions; focus never escapes the dialog', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    const cancel = getByTestId('abandon-cancel');
    const confirm = getByTestId('abandon-confirm');
    await waitFor(() => expect(document.activeElement).toBe(cancel));

    // Tab from Cancel (last in DOM) wraps to Confirm (first in DOM).
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(confirm);

    // Tab from Confirm → Cancel (native-correct intra-surface; trap fires).
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);

    // Shift+Tab from Cancel → Confirm (native-correct intra-surface; trap fires).
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);

    // Shift+Tab from Confirm (first in DOM) wraps to Cancel (last in DOM).
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancel);
  });

  it('menu-state Tab keeps focus on the single menuitem (no escape behind scrim)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    const menuitem = getByTestId('abandon-menuitem');
    await waitFor(() => expect(document.activeElement).toBe(menuitem));
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(menuitem);
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(menuitem);
  });

  // Phase 2.5 meta-audit A.3: scrim aria-hidden.
  it('scrim has aria-hidden="true" (visually decorative; modal semantic on dialog)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    expect(getByTestId('abandon-scrim').getAttribute('aria-hidden')).toBe('true');
  });

  // Phase 2.5 meta-audit A.4: focus-visible indicator. The trigger
  // and both confirm-surface buttons carry the .focus-ring class
  // backed by a single :focus-visible rule in index.css. happy-dom
  // does not compute :focus-visible nor resolve var(--accent) at
  // layout time — assert class presence rather than computed style.
  it('focus-ring class present on trigger + both confirm buttons (keyboard-only outline)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    expect(getByTestId('abandon-trigger').className).toContain('focus-ring');
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    expect(getByTestId('abandon-cancel').className).toContain('focus-ring');
    expect(getByTestId('abandon-confirm').className).toContain('focus-ring');
  });

  it('Abandon button confirms — fires abandonRun (RunEndScreen mounts via RunProvider gate)', async () => {
    const { getByTestId, findByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    fireEvent.click(getByTestId('abandon-confirm'));
    // RunProvider's isRunEnded gate routes to RunEndScreen; data-outcome
    // is the joint witness of reducer flip + simRun preservation.
    const screen = await findByTestId('run-end-screen', undefined, { timeout: 3000 });
    expect(screen.getAttribute('data-outcome')).toBe('abandoned');
  });

  it('Abandon button has NEUTRAL ghost styling (no #DC2626 destructive accent)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    const confirm = getByTestId('abandon-confirm') as HTMLButtonElement;
    // Inline styles use the --border-default / --text-secondary tokens;
    // happy-dom doesn't compute CSS vars, but the raw style attribute
    // is the contract: no rgb(220, 38, 38) / #DC2626 / red leakage.
    const styleStr = confirm.getAttribute('style') ?? '';
    expect(styleStr).not.toContain('#DC2626');
    expect(styleStr).not.toContain('220, 38, 38');
    expect(styleStr).not.toMatch(/red/i);
    // Positive assertion: uses the ratified token.
    expect(styleStr).toContain('var(--border-default)');
    expect(styleStr).toContain('var(--text-secondary)');
  });
});

// ─── Mobile one-step flow ────────────────────────────────────────────

describe('AbandonRunMenu — mobile (one-step: ⋯ → bottom-sheet)', () => {
  beforeEach(() => mockViewport('mobile'));

  it('⋯ click opens bottom-sheet DIRECTLY (no intermediate menu)', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    expect(getByTestId('abandon-sheet')).toBeInTheDocument();
    expect(queryByTestId('abandon-menu')).toBeNull();
    expect(queryByTestId('abandon-dialog')).toBeNull();
  });

  it('sheet renders the same locked copy as the desktop dialog', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    expect(getByTestId('abandon-title').textContent).toBe('Abandon this run?');
    expect(getByTestId('abandon-body').textContent).toBe(
      'Your bag, relics, trophies, and contract progress will be lost.',
    );
    expect(getByTestId('abandon-cancel').textContent).toBe('Keep playing');
    expect(getByTestId('abandon-confirm').textContent).toBe('Abandon run');
  });

  it('Cancel auto-focused on sheet mount', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    await waitFor(() => {
      expect(document.activeElement).toBe(getByTestId('abandon-cancel'));
    });
  });

  it('scrim/Esc/Cancel all close the sheet', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-cancel'));
    await waitFor(() => expect(queryByTestId('abandon-sheet')).toBeNull());

    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(queryByTestId('abandon-sheet')).toBeNull());

    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-scrim'));
    await waitFor(() => expect(queryByTestId('abandon-sheet')).toBeNull());
  });

  it('Abandon button confirms — RunEndScreen ABANDONED mounts', async () => {
    const { getByTestId, findByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-confirm'));
    const screen = await findByTestId('run-end-screen', undefined, { timeout: 3000 });
    expect(screen.getAttribute('data-outcome')).toBe('abandoned');
  });
});

// ─── Z-stack invariant ────────────────────────────────────────────────

describe('AbandonRunMenu — z-index stack (scrim above top bar, below dialog)', () => {
  it('scrim z < dialog z (desktop)', async () => {
    mockViewport('desktop');
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    const scrim = getByTestId('abandon-scrim');
    const dialog = getByTestId('abandon-dialog');
    const scrimZ = Number(scrim.style.zIndex);
    const dialogZ = Number(dialog.style.zIndex);
    expect(scrimZ).toBeLessThan(dialogZ);
    // Sanity: scrim is well above default stacking (TopBar has no
    // z-index → 0). Pinning ≥ 200 keeps any future TopBar z bumps
    // (sticky headers, etc.) below the scrim.
    expect(scrimZ).toBeGreaterThanOrEqual(200);
  });

  it('scrim z < sheet z (mobile)', async () => {
    mockViewport('mobile');
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    const scrim = getByTestId('abandon-scrim');
    const sheet = getByTestId('abandon-sheet');
    expect(Number(scrim.style.zIndex)).toBeLessThan(Number(sheet.style.zIndex));
  });
});

// ─── Standalone trigger smoke (no in-run context) ─────────────────────

describe('AbandonRunMenu — standalone smoke (closed state)', () => {
  it('renders no menu/dialog/sheet/scrim in the closed state', async () => {
    mockViewport('desktop');
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    expect(queryByTestId('abandon-menu')).toBeNull();
    expect(queryByTestId('abandon-dialog')).toBeNull();
    expect(queryByTestId('abandon-sheet')).toBeNull();
    expect(queryByTestId('abandon-scrim')).toBeNull();
  });
});

// Re-exported to silence unused-import warning for useState (we don't
// actually need it in tests, but kept imported in case future tests
// need controlled wrappers).
void useState;
