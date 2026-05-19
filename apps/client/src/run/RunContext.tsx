// Run-state context provider — owns useRun at the RunScreen dispatcher
// level so the underlying useReducer state survives Desktop ↔ Mobile
// orchestrator swaps when the viewport crosses the 768px breakpoint.
//
// Codex Review caught this in M1.3.3 step 10 as a P1 regression: prior
// to the fix, both DesktopRunScreen and MobileRunScreen called
// useRun() independently. The dispatcher's conditional render
// unmounted whichever orchestrator was leaving and mounted the other,
// destroying its useReducer state — bag, shop, combat progress all
// reset on rotation / window resize across the breakpoint. This
// regressed M1.3.2's single-orchestrator behavior.
//
// Fix: lift useRun() into <RunProvider>, which RunScreen wraps both
// branches in. RunProvider stays mounted across the dispatcher's
// child swaps, so useRun's state persists across viewport switches.
//
// Architectural rule (project-wide carry-forward): lazy-loaded
// sub-tree dispatchers must own any state that should persist across
// the dispatch boundary. State below the dispatcher's swap point is
// destroyed on every swap.

import { createContext, lazy, Suspense, useContext, type ReactNode } from 'react';
import { useRun } from './useRun';

// Lazy-import the class-select screen so its atoms + Desktop + Mobile
// components ship in a dedicated chunk rather than the main bundle.
// Honors the tech-architecture.md § 10 lazy-load discipline (M1.5b PR 1
// bundle-delta budget). The RunBootFallback rendered during the
// lazy-import microtask is visually identical to the createRun-in-flight
// fallback, so the transition is seamless.
const ClassSelectScreen = lazy(() =>
  import('../screens/ClassSelectScreen').then((m) => ({
    default: m.ClassSelectScreen,
  })),
);

// Lazy-import the run-end summary screen for the same bundle-isolation
// reason — RunEndScreen mounts only when isRunEnded flips true, which
// is rare per session, so paying its bytes upfront in the main chunk
// would burn budget on a surface most users won't see until end of
// run. Same RunBootFallback during the microtask.
const RunEndScreen = lazy(() =>
  import('../screens/RunEndScreen').then((m) => ({
    default: m.RunEndScreen,
  })),
);

type RunContextValue = ReturnType<typeof useRun>;

const RunContext = createContext<RunContextValue | null>(null);

/** Full-viewport placeholder rendered between class-select confirm and
 *  sim's createRun resolving — that race is short (one dynamic-import
 *  microtask), so the fallback is rarely visible in practice. Mirrors
 *  the MobileFallback in apps/client/src/screens/RunScreen.tsx — same
 *  `var(--bg-deep)` full-viewport div so the boot transition is
 *  visually indistinguishable from app-load → first-paint. */
function RunBootFallback() {
  return (
    <div
      data-testid="run-boot-fallback"
      style={{ width: '100%', minHeight: '100vh', background: 'var(--bg-deep)' }}
    />
  );
}

export function RunProvider({ children }: { children: ReactNode }) {
  const value = useRun();
  if (value.simRun === null) {
    if (value.pendingRunInput === null) {
      return (
        <Suspense fallback={<RunBootFallback />}>
          <ClassSelectScreen onConfirm={value.beginRun} />
        </Suspense>
      );
    }
    return <RunBootFallback />;
  }
  // M1.5b PR 2 Q(a) + Q(h): post-run is an architectural bookend to
  // ClassSelectScreen. RunEndScreen mounts INSIDE RunContext.Provider
  // so it can call useRunContext() for the 8 ratified fields without
  // prop-drilling. The in-run children (DesktopRunScreen + MobileRunScreen
  // + their TopBar / LeftRail / BagBoard / ShopPanel) are not mounted
  // while RunEndScreen owns the viewport. CF 21 summary-side closes here.
  if (value.isRunEnded) {
    return (
      <RunContext.Provider value={value}>
        <Suspense fallback={<RunBootFallback />}>
          <RunEndScreen onRestart={value.resetRun} />
        </Suspense>
      </RunContext.Provider>
    );
  }
  return <RunContext.Provider value={value}>{children}</RunContext.Provider>;
}

export function useRunContext(): RunContextValue {
  const ctx = useContext(RunContext);
  if (ctx === null) {
    throw new Error('useRunContext must be called inside <RunProvider>');
  }
  return ctx;
}
