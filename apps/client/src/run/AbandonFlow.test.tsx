// Full abandon-flow integration tests (M1.5b PR 3 / 5b.3b Step 5).
//
// Goes beyond the standalone AbandonRunMenu component tests (Step 3)
// by exercising the trigger through the actual wired TopBar surface
// (Step 4). End-to-end flow:
//   render TopBar (inside RunProvider)
//   → ⋯ trigger present in the top-bar right cluster
//   → click ⋯ → confirm surface mounts (desktop dialog / mobile sheet)
//   → click Abandon → RunProvider's isRunEnded gate fires →
//      RunEndScreen ABANDONED mounts with the 8 ratified fields read.
// Plus cancel paths (Esc / scrim / Cancel button) prove they leave the
// run in-progress.

import { useEffect } from 'react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { ClassId, RelicId } from '@packbreaker/content';
import { RunProvider, useRunContext } from './RunContext';
import { TopBar } from '../hud/TopBar';
import { MobileTopBar } from '../hud/mobile/MobileTopBar';

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

function mockViewport(mode: 'desktop' | 'mobile') {
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

/** Renders TopBar inside RunProvider with the context's RunState
 *  threaded in via a small consumer wrapper. */
function TopBarWithState({ variant }: { variant: 'desktop' | 'mobile' }) {
  const { state } = useRunContext();
  return variant === 'mobile' ? (
    <MobileTopBar state={state.state} />
  ) : (
    <TopBar state={state.state} />
  );
}

function renderTopBar(variant: 'desktop' | 'mobile') {
  return render(
    <RunProvider>
      <TopBarWithState variant={variant} />
    </RunProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('Abandon full-flow integration (Step 5) — desktop', () => {
  beforeEach(() => mockViewport('desktop'));

  it('⋯ trigger is present in the desktop top bar right cluster after the trophy + hairline divider', async () => {
    const { findByTestId } = renderTopBar('desktop');
    const trigger = await findByTestId('abandon-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute('aria-label')).toBe('Run options');
    const divider = await findByTestId('topbar-divider');
    expect(divider).toBeInTheDocument();
  });

  it('full flow: ⋯ → menu → Abandon run → confirm dialog → Abandon → RunEndScreen ABANDONED', async () => {
    const { findByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-menuitem'));
    fireEvent.click(await findByTestId('abandon-confirm'));
    const screen = await findByTestId('run-end-screen', undefined, { timeout: 3000 });
    expect(screen.getAttribute('data-outcome')).toBe('abandoned');
    expect(screen.getAttribute('data-viewport')).toBe('desktop');
    // RUN ABANDONED label per RunEndScreen OUTCOME_LABELS.
    const label = await findByTestId('runend-label');
    expect(label.textContent).toBe('RUN ABANDONED');
  });

  it('cancel path — Esc from confirm leaves the run in_progress (no terminal screen)', async () => {
    const { findByTestId, queryByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-menuitem'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
    // RunEndScreen never mounts; trigger is still present in the
    // in-run top bar (the gate did not flip).
    expect(queryByTestId('run-end-screen')).toBeNull();
    expect(queryByTestId('abandon-trigger')).toBeInTheDocument();
  });

  it('cancel path — scrim click closes without abandoning', async () => {
    const { findByTestId, queryByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-menuitem'));
    fireEvent.click(await findByTestId('abandon-scrim'));
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
    expect(queryByTestId('run-end-screen')).toBeNull();
  });

  it('cancel path — "Keep playing" button closes without abandoning', async () => {
    const { findByTestId, queryByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-menuitem'));
    fireEvent.click(await findByTestId('abandon-cancel'));
    await waitFor(() => {
      expect(queryByTestId('abandon-dialog')).toBeNull();
    });
    expect(queryByTestId('run-end-screen')).toBeNull();
  });

  it('RunEndScreen ABANDONED renders all 8 ratified fields from preserved state', async () => {
    const { findByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-menuitem'));
    fireEvent.click(await findByTestId('abandon-confirm'));
    // Field 1: outcome (data-outcome attribute on the screen root).
    const screen = await findByTestId('run-end-screen', undefined, { timeout: 3000 });
    expect(screen.getAttribute('data-outcome')).toBe('abandoned');
    // Field 3: classId → className via CLASSES lookup ("Tinker").
    const klass = await findByTestId('runend-class');
    expect(klass.textContent).toBe('Tinker');
    // Field 1+2: outcome + round drives the sub-copy "Quit at Round N".
    const sub = await findByTestId('runend-sub');
    expect(sub.textContent).toBe('Quit at Round 1');
    // Field 1 + glyph: ABANDONED glyph is ⊘.
    const glyph = await findByTestId('runend-glyph');
    expect(glyph.textContent).toBe('⊘');
    // Field 1 + label: "RUN ABANDONED".
    const label = await findByTestId('runend-label');
    expect(label.textContent).toBe('RUN ABANDONED');
  });
});

describe('Abandon full-flow integration (Step 5) — mobile', () => {
  beforeEach(() => mockViewport('mobile'));

  it('⋯ trigger is present in the mobile top bar right cluster (grouped with OpponentSilhouette)', async () => {
    const { findByTestId } = renderTopBar('mobile');
    const trigger = await findByTestId('abandon-trigger');
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute('aria-label')).toBe('Run options');
  });

  it('full flow: ⋯ → bottom-sheet → Abandon → RunEndScreen ABANDONED (mobile viewport)', async () => {
    const { findByTestId } = renderTopBar('mobile');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-confirm'));
    const screen = await findByTestId('run-end-screen', undefined, { timeout: 3000 });
    expect(screen.getAttribute('data-outcome')).toBe('abandoned');
    expect(screen.getAttribute('data-viewport')).toBe('mobile');
  });

  it('cancel path — Esc from sheet leaves the run in_progress', async () => {
    const { findByTestId, queryByTestId } = renderTopBar('mobile');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(queryByTestId('abandon-sheet')).toBeNull();
    });
    expect(queryByTestId('run-end-screen')).toBeNull();
  });

  it('cancel path — scrim click closes without abandoning', async () => {
    const { findByTestId, queryByTestId } = renderTopBar('mobile');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-scrim'));
    await waitFor(() => {
      expect(queryByTestId('abandon-sheet')).toBeNull();
    });
    expect(queryByTestId('run-end-screen')).toBeNull();
  });
});

// ─── Visual playtest 4-state DOM capture ──────────────────────────────
//
// The decision-log convention for "visual playtest" is a human-driven
// browser observation. This test captures the four ratified states at
// the DOM-snapshot level so the markup contract is locked in CI; the
// human-driven visual playtest layer overlays computed-style + actual
// pixel verification against the v3 design board.
//
// Four states captured:
//   1. Desktop ⋯ menu open
//   2. Desktop confirm dialog open
//   3. Mobile bottom-sheet open
//   4. RunEndScreen ABANDONED (post-confirm)

describe('Abandon UI — 4-state DOM capture (visual-playtest reference)', () => {
  it('state 1 — desktop ⋯ menu open: menu present, dialog absent, scrim present', async () => {
    mockViewport('desktop');
    const { findByTestId, queryByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    expect(queryByTestId('abandon-menu')).toBeInTheDocument();
    expect(queryByTestId('abandon-scrim')).toBeInTheDocument();
    expect(queryByTestId('abandon-dialog')).toBeNull();
    expect(queryByTestId('abandon-sheet')).toBeNull();
    // The single menu item text matches v3 copy.
    expect((await findByTestId('abandon-menuitem')).textContent).toBe('Abandon run');
  });

  it('state 2 — desktop confirm dialog open: dialog present with full v3 copy + neutral-ghost Abandon button', async () => {
    mockViewport('desktop');
    const { findByTestId, queryByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-menuitem'));
    expect(queryByTestId('abandon-dialog')).toBeInTheDocument();
    expect((await findByTestId('abandon-title')).textContent).toBe('Abandon this run?');
    expect((await findByTestId('abandon-body')).textContent).toBe(
      'Your bag, relics, trophies, and contract progress will be lost.',
    );
    const confirm = (await findByTestId('abandon-confirm')) as HTMLButtonElement;
    const cancel = (await findByTestId('abandon-cancel')) as HTMLButtonElement;
    expect(confirm.textContent).toBe('Abandon run');
    expect(cancel.textContent).toBe('Keep playing');
    // Neutral-ghost styling on Abandon; filled accent on Cancel.
    expect(confirm.getAttribute('style')).toContain('var(--border-default)');
    expect(cancel.getAttribute('style')).toContain('var(--accent)');
  });

  it('state 3 — mobile bottom-sheet open: sheet present (no menu intermediate), v3 copy + buttons', async () => {
    mockViewport('mobile');
    const { findByTestId, queryByTestId } = renderTopBar('mobile');
    fireEvent.click(await findByTestId('abandon-trigger'));
    expect(queryByTestId('abandon-sheet')).toBeInTheDocument();
    expect(queryByTestId('abandon-menu')).toBeNull();
    expect(queryByTestId('abandon-dialog')).toBeNull();
    expect((await findByTestId('abandon-title')).textContent).toBe('Abandon this run?');
    expect((await findByTestId('abandon-confirm')).textContent).toBe('Abandon run');
    expect((await findByTestId('abandon-cancel')).textContent).toBe('Keep playing');
  });

  it('state 4 — RunEndScreen ABANDONED: glyph ⊘ + label RUN ABANDONED + Quit-at-Round sub-copy', async () => {
    mockViewport('desktop');
    const { findByTestId } = renderTopBar('desktop');
    fireEvent.click(await findByTestId('abandon-trigger'));
    fireEvent.click(await findByTestId('abandon-menuitem'));
    fireEvent.click(await findByTestId('abandon-confirm'));
    // Wait on the RunEndScreen lazy-import boundary FIRST so the
    // subsequent runend-* children resolve from already-mounted DOM
    // (no separate lazy wait needed for the children).
    const screen = await findByTestId('run-end-screen', undefined, { timeout: 3000 });
    expect(screen.getAttribute('data-outcome')).toBe('abandoned');
    expect((await findByTestId('runend-glyph')).textContent).toBe('⊘');
    expect((await findByTestId('runend-label')).textContent).toBe('RUN ABANDONED');
    expect((await findByTestId('runend-sub')).textContent).toBe('Quit at Round 1');
  });
});
