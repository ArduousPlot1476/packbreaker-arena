// JS viewport-detect at 768px breakpoint per M1.3.3 ratification
// (decision-log 2026-05-01 + decision 8 in chat). Two orchestrators
// share primitives: only the active layout's component tree mounts at
// a time, which keeps @dnd-kit sensor config (PointerSensor on
// desktop, PointerSensor + TouchSensor on mobile) cleanly per-layout.
//
// Threshold: < 768px → mobile, ≥ 768px → desktop. Matches Tailwind's
// `md` breakpoint convention. Tablet/intermediate (768–1024) reads as
// desktop per gdd.md § 14 (no separate tablet design in M1).
//
// Breakpoint flicker mitigations (debounce, persist-last-active) are
// deferred per Trey's ratification — revisit only if a user reports it.

import { useEffect, useState } from 'react';

export type Viewport = 'mobile' | 'desktop';

const MOBILE_QUERY = '(max-width: 767px)';

function readViewport(): Viewport {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'desktop';
  }
  return window.matchMedia(MOBILE_QUERY).matches ? 'mobile' : 'desktop';
}

export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(readViewport);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia(MOBILE_QUERY);
    function listener(event: MediaQueryListEvent) {
      setViewport(event.matches ? 'mobile' : 'desktop');
    }
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  return viewport;
}
