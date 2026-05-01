// Branch-dispatcher test: RunScreen reads useViewport and renders
// DesktopRunScreen at desktop, MobileRunScreen at mobile. Stubs
// matchMedia to control viewport. Smoke-tests both branches via a
// "MOBILE LAYOUT" / "BAG · 6×4" header sentinel since fully rendering
// the desktop tree requires the @dnd-kit DndContext that the
// orchestrators provide internally.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { RunScreen } from './RunScreen';

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

  it('renders DesktopRunScreen when matchMedia(max-width:767) is false', () => {
    matchesValue = false;
    const { container } = render(<RunScreen />);
    // Desktop renders BAG · 6×4 header (compact mode is OFF by default).
    expect(container.textContent).toContain('BAG · 6×4');
  });

  it('renders MobileRunScreen when matchMedia(max-width:767) is true', () => {
    matchesValue = true;
    const { container } = render(<RunScreen />);
    // Mobile compact mode hides the BAG · 6×4 header. The mobile tab bar
    // is rendered with all 4 tab labels.
    expect(container.textContent).not.toContain('BAG · 6×4');
    expect(container.textContent).toContain('SHOP');
    expect(container.textContent).toContain('CRAFTING');
    expect(container.textContent).toContain('RELICS');
    expect(container.textContent).toContain('LOG');
  });
});
