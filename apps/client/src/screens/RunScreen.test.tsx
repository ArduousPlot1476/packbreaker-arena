// Branch-dispatcher tests for RunScreen. Stubs matchMedia to control
// viewport. Desktop branch renders synchronously; mobile branch is
// lazy-loaded behind React.lazy + Suspense per M1.3.3 commit 8.5.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { RunScreen } from './RunScreen';

// M1.4b1 Phase 2.5: stub the lazy-loaded MobileRunScreen module so the
// dispatcher test doesn't race the real dynamic import + Suspense
// flush under parallel-load conditions. The dispatcher is the unit
// under test — MobileRunScreen content is incidental observable state.
// The stub renders the same tab-label strings the real component
// surfaces ('SHOP', 'CRAFTING', 'RELICS', 'LOG'); changing those
// labels in production won't surface here, but coverage of the
// labels lives in MobileTabBar.test.tsx (the dedicated tab-bar test).
vi.mock('./mobile/MobileRunScreen', () => ({
  MobileRunScreen: function MobileRunScreenStub() {
    return <div>SHOP CRAFTING RELICS LOG</div>;
  },
}));

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

describe('RunScreen branch dispatcher', () => {
  let matchesValue = false;

  beforeEach(() => {
    matchesValue = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(
        (query: string): FakeMediaQueryList => ({
          matches: matchesValue,
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders DesktopRunScreen synchronously when matchMedia is false', () => {
    matchesValue = false;
    const { container } = render(<RunScreen />);
    // Desktop renders BAG · 6×4 header (compact mode is OFF by default)
    // and renders synchronously — no Suspense fallback path involved.
    expect(container.textContent).toContain('BAG · 6×4');
    expect(container.querySelector('[data-testid="mobile-suspense-fallback"]')).toBeNull();
  });

  it('renders MobileRunScreen (lazy) when matchMedia is true', async () => {
    matchesValue = true;
    const { container } = render(<RunScreen />);
    // The mobile module is loaded async; tab labels appear once
    // React.lazy resolves and Suspense unblocks.
    await waitFor(() => {
      expect(container.textContent).toContain('SHOP');
    });
    expect(container.textContent).toContain('CRAFTING');
    expect(container.textContent).toContain('RELICS');
    expect(container.textContent).toContain('LOG');
    expect(container.textContent).not.toContain('BAG · 6×4');
  });

});

// NOTE: a "Suspense fallback transient" test was attempted but proved
// unreliable under vitest/happy-dom — the dynamic import resolves
// faster than the synchronous DOM query can capture the fallback
// element, even when the test inspects `container` immediately after
// `render()`. The async-render path is covered above by the
// waitFor-based mobile test ("renders MobileRunScreen (lazy) when
// matchMedia is true"). The fallback render path is exercised in the
// real browser; visual confirmation lands as part of the screenshot
// deliverable hand-off.
