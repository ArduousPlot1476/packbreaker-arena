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

import { createContext, useContext, type ReactNode } from 'react';
import { ClassSelectScreen } from '../screens/ClassSelectScreen';
import { useRun } from './useRun';

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
      return <ClassSelectScreen onConfirm={value.beginRun} />;
    }
    return <RunBootFallback />;
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
