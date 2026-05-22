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

  it('Enter triggers Cancel (default-weighted)', async () => {
    const { getByTestId, queryByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    fireEvent.keyDown(window, { key: 'Enter' });
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
  });

  it('focus traps between Cancel and Abandon (Tab cycles)', async () => {
    const { getByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    const cancel = getByTestId('abandon-cancel');
    const confirm = getByTestId('abandon-confirm');
    await waitFor(() => expect(document.activeElement).toBe(cancel));
    // Tab from Cancel → Confirm (Cancel is rendered AFTER Confirm in
    // DOM order so default Tab moves away from Cancel; the trap fires
    // when Tab from Confirm would leave the dialog → bounces to Cancel).
    confirm.focus();
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(cancel);
    // Shift+Tab from Cancel → Confirm.
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it('Abandon button confirms — fires abandonRun (RunEndScreen mounts via RunProvider gate)', async () => {
    const { getByTestId, findByTestId } = renderMenu();
    await waitForTrigger(getByTestId);
    fireEvent.click(getByTestId('abandon-trigger'));
    fireEvent.click(getByTestId('abandon-menuitem'));
    fireEvent.click(getByTestId('abandon-confirm'));
    // RunProvider's isRunEnded gate routes to RunEndScreen; data-outcome
    // is the joint witness of reducer flip + simRun preservation.
    const screen = await findByTestId('run-end-screen');
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
    const screen = await findByTestId('run-end-screen');
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
