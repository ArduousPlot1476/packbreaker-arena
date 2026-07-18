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

import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useRun } from './useRun';
import { usePlayerSavePush, type RoundResultReport } from './usePlayerSavePush';
import { useAccountLinked, useSyncHydrated } from '../auth/AccountLinkContext';

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

/** R5: bounded-retry-then-drop — the max network attempts per round before the
 *  queue drops the head and advances. Keeps the backlog bounded by construction. */
const MAX_PUSH_ATTEMPTS = 2;

export function RunProvider({ children }: { children: ReactNode }) {
  // CF-77 Phase 2 PR2 (R5/R7): useRun's per-round producer invokes onRoundResult
  // with one completed round; RunProvider wraps the raw push (usePlayerSavePush,
  // gated linked && hydrated) in a SESSION-SCOPED ORDERED-DELIVERY QUEUE so each
  // round's PUT awaits the prior one's ack — removing out-of-order delivery at
  // the source (the round-4 honest-client residual). No-op on the anonymous path.
  const pushRoundResult = usePlayerSavePush();
  const linked = useAccountLinked();
  const hydrated = useSyncHydrated();

  // Live-gate + latest-push refs so the STABLE enqueue/drain callbacks read
  // current values without re-subscribing (mirrors usePlayerSavePush's gateRef).
  const gateRef = useRef({ linked, hydrated });
  gateRef.current = { linked, hydrated };
  const pushRef = useRef(pushRoundResult);
  pushRef.current = pushRoundResult;

  // The queue lives in a REF here (NOT a module singleton, R5): its lifetime is
  // tied to this RunProvider instance/run, it needs no global reset in tests, and
  // it survives the Desktop/Mobile dispatcher child swaps (RunProvider stays
  // mounted across them). IN-MEMORY ONLY — a page reload empties it and
  // un-drained pushes are lost (R6 accepted residual → CF-79). StrictMode's dev
  // double-mount can drop the queue on the throwaway first mount: DEV-ONLY,
  // documented here, deliberately NOT engineered around.
  const queueRef = useRef<RoundResultReport[]>([]);
  const drainingRef = useRef(false);

  const drainQueue = useCallback(async () => {
    if (drainingRef.current) return;
    // HOLD (do not drop) while signed out or the initial pull is in flight
    // (pull-before-push) — the [linked, hydrated] effect re-kicks the drain when
    // the gate opens, so a round enqueued before hydration is never lost.
    if (!gateRef.current.linked || !gateRef.current.hydrated) return;
    drainingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const head = queueRef.current[0]!;
        // BOUNDED-RETRY-THEN-DROP (R5): at most MAX_PUSH_ATTEMPTS network attempts
        // per round, awaiting each ack IN ORDER, then drop the head and advance.
        // This bounds the backlog by construction — a stalled or unbounded queue
        // is unreachable. A dropped round is the R6 residual (server-wins
        // reconciles; CF-79 is the real fix). Retrying an already-applied round
        // is a safe no-op via the server idempotency record.
        let delivered = false;
        for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS && !delivered; attempt++) {
          delivered = await pushRef.current(head);
        }
        // Drop the head whether delivered or exhausted — never re-queue, so the
        // queue always drains to empty (no head-of-line stall).
        queueRef.current.shift();
      }
    } finally {
      drainingRef.current = false;
    }
  }, []);

  const enqueueRoundResult = useCallback(
    (result: RoundResultReport) => {
      // Anonymous / signed-out: never push, and never ENQUEUE — an un-drainable
      // queue would grow unbounded. Server-wins on a later sign-in reconciles.
      if (!gateRef.current.linked) return;
      queueRef.current.push(result);
      void drainQueue();
    },
    [drainQueue],
  );

  // Re-kick the drain when the gate opens (initial pull settles, or sign-in) so
  // rounds enqueued while linked-but-not-yet-hydrated flush without waiting for
  // the next round to arrive.
  useEffect(() => {
    if (linked && hydrated) void drainQueue();
  }, [linked, hydrated, drainQueue]);

  const value = useRun({ onRoundResult: enqueueRoundResult });
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
          <RunEndScreen onPlayAgain={value.replaySameClass} onRestart={value.resetRun} />
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
