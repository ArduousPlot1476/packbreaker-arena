// Unit tests for useViewport hook. Stubs window.matchMedia to verify
// initial read + change-event-driven updates. The MOBILE_QUERY string
// `(max-width: 767px)` is the implementation detail; tests assert
// only the resolved 'mobile' | 'desktop' return.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useViewport } from './useViewport';

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: (event: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  removeEventListener: (event: 'change', listener: (e: MediaQueryListEvent) => void) => void;
  addListener: () => void;
  removeListener: () => void;
  dispatchEvent: () => boolean;
  onchange: null;
}

describe('useViewport', () => {
  let listeners: Array<(e: MediaQueryListEvent) => void> = [];
  let matchesValue = false;

  beforeEach(() => {
    listeners = [];
    matchesValue = false;
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string): FakeMediaQueryList => ({
        matches: matchesValue,
        media: query,
        addEventListener: (_event, listener) => {
          listeners.push(listener);
        },
        removeEventListener: (_event, listener) => {
          const idx = listeners.indexOf(listener);
          if (idx !== -1) listeners.splice(idx, 1);
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns "desktop" when matchMedia.matches is false', () => {
    matchesValue = false;
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('desktop');
  });

  it('returns "mobile" when matchMedia.matches is true', () => {
    matchesValue = true;
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('mobile');
  });

  it('updates when the media query change event fires', () => {
    matchesValue = false;
    const { result } = renderHook(() => useViewport());
    expect(result.current).toBe('desktop');
    act(() => {
      listeners.forEach((l) => l({ matches: true } as MediaQueryListEvent));
    });
    expect(result.current).toBe('mobile');
    act(() => {
      listeners.forEach((l) => l({ matches: false } as MediaQueryListEvent));
    });
    expect(result.current).toBe('desktop');
  });

  it('removes its change listener on unmount', () => {
    matchesValue = false;
    const { unmount } = renderHook(() => useViewport());
    expect(listeners.length).toBe(1);
    unmount();
    expect(listeners.length).toBe(0);
  });
});
