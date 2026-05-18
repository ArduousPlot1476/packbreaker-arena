// M1.5b PR 1 Implementation F.5 — ClassSelectScreen unit tests.
//
// Covers the two-stage state machine on the desktop branch (default
// viewport in happy-dom when matchMedia returns false):
//   - Stage transitions: class pick → stage 2; "or-switch" + "change"
//   - Starter selection per-class (pool changes when class switches)
//   - Begin Run CTA gating + onConfirm payload
//
// Mobile-specific affordances (sticky context + CHANGE button) are
// covered by stubbing matchMedia.matches=true in the mobile describe
// block. The Suspense fallback during mobile lazy-load is treated as
// "wait for class-card to appear" rather than asserted directly —
// React.lazy resolution is incidental.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/react';
import type { ClassId, RelicId } from '@packbreaker/content';
import { ClassSelectScreen } from './ClassSelectScreen';

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: () => void;
  removeEventListener: () => void;
  addListener: () => void;
  removeListener: () => void;
  dispatchEvent: () => boolean;
  onchange: null;
}

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(
      (query: string): FakeMediaQueryList => ({
        matches,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      }),
    ),
  );
}

describe('ClassSelectScreen — desktop branch', () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => vi.unstubAllGlobals());

  it('mounts at stage 1 with both class cards and a disabled CTA', () => {
    const onConfirm = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <ClassSelectScreen onConfirm={onConfirm} />,
    );
    expect(getByTestId('class-card-tinker')).toBeInTheDocument();
    expect(getByTestId('class-card-marauder')).toBeInTheDocument();
    expect(getByTestId('begin-run-cta')).toBeDisabled();
    // Stage 2 affordances are not present.
    expect(queryByTestId('relic-card-apprentices-loop')).toBeNull();
    expect(queryByTestId('selected-class-context')).toBeNull();
  });

  it('clicking a class card advances to stage 2 with Tinker pool', () => {
    const onConfirm = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <ClassSelectScreen onConfirm={onConfirm} />,
    );
    fireEvent.click(getByTestId('class-card-tinker'));
    // Selected class context card appears (left column), starter pool cards
    // on the right (Tinker pool: apprentices-loop, pocket-forge, merchants-mark).
    expect(getByTestId('selected-class-context')).toBeInTheDocument();
    expect(getByTestId('relic-card-apprentices-loop')).toBeInTheDocument();
    expect(getByTestId('relic-card-pocket-forge')).toBeInTheDocument();
    expect(getByTestId('relic-card-merchants-mark')).toBeInTheDocument();
    // Marauder pool relics are NOT present.
    expect(queryByTestId('relic-card-razors-edge')).toBeNull();
    // CTA still disabled until a relic is picked.
    expect(getByTestId('begin-run-cta')).toBeDisabled();
  });

  it('Marauder + iron-will → Begin Run fires onConfirm with Marauder payload', () => {
    const onConfirm = vi.fn();
    const { getByTestId } = render(
      <ClassSelectScreen onConfirm={onConfirm} />,
    );
    fireEvent.click(getByTestId('class-card-marauder'));
    fireEvent.click(getByTestId('relic-card-iron-will'));
    const cta = getByTestId('begin-run-cta');
    expect(cta).not.toBeDisabled();
    fireEvent.click(cta);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      classId: 'marauder' as ClassId,
      startingRelicId: 'iron-will' as RelicId,
    });
  });

  it('OR-SWITCH on stage 2 swaps the class and resets the starter selection', () => {
    const onConfirm = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <ClassSelectScreen onConfirm={onConfirm} />,
    );
    // Pick Tinker + relic.
    fireEvent.click(getByTestId('class-card-tinker'));
    fireEvent.click(getByTestId('relic-card-apprentices-loop'));
    expect(getByTestId('begin-run-cta')).not.toBeDisabled();

    // Click "or switch" Marauder card (dimmed) — pool flips, starter resets.
    fireEvent.click(getByTestId('or-switch-class'));
    // Marauder pool now visible.
    expect(getByTestId('relic-card-razors-edge')).toBeInTheDocument();
    expect(getByTestId('relic-card-iron-will')).toBeInTheDocument();
    // Tinker pool gone.
    expect(queryByTestId('relic-card-apprentices-loop')).toBeNull();
    // Starter cleared → CTA disabled.
    expect(getByTestId('begin-run-cta')).toBeDisabled();
  });
});

describe('ClassSelectScreen — mobile branch', () => {
  beforeEach(() => stubMatchMedia(true));
  afterEach(() => vi.unstubAllGlobals());

  it('mobile CHANGE returns to stage 1 + clears class and starter', async () => {
    const onConfirm = vi.fn();
    const { getByTestId, queryByTestId } = render(
      <ClassSelectScreen onConfirm={onConfirm} />,
    );
    // React.lazy resolves; class-card appears. Dynamic-import flush
    // in happy-dom is slower than the default 1s waitFor — give it 5s
    // before failing (mirrors the M1.3.3 mobile-suspense pattern).
    await waitFor(
      () => {
        expect(getByTestId('class-card-tinker')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );
    // Pick Marauder + iron-will.
    fireEvent.click(getByTestId('class-card-marauder'));
    fireEvent.click(getByTestId('relic-card-iron-will'));
    expect(getByTestId('mobile-class-context')).toBeInTheDocument();
    expect(getByTestId('begin-run-cta')).not.toBeDisabled();

    // CHANGE → stage 1.
    fireEvent.click(getByTestId('mobile-change-class'));
    expect(getByTestId('class-card-tinker')).toBeInTheDocument();
    expect(getByTestId('class-card-marauder')).toBeInTheDocument();
    expect(queryByTestId('mobile-class-context')).toBeNull();
    expect(queryByTestId('relic-card-iron-will')).toBeNull();

    // Re-pick — different class this time.
    fireEvent.click(getByTestId('class-card-tinker'));
    expect(getByTestId('mobile-class-context')).toBeInTheDocument();
    expect(getByTestId('relic-card-apprentices-loop')).toBeInTheDocument();
  });
});
