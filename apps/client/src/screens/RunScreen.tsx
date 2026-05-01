// Branch dispatcher per M1.3.3 commit 3 + lazy-loaded mobile per
// commit 8.5 + run-state lift per commit 10 (Codex P1 fix).
//
// This dispatcher reads viewport via useViewport (matchMedia at the
// 768px breakpoint) and renders either the desktop or mobile
// orchestrator. The mobile module is loaded on-demand via
// React.lazy — desktop users never parse mobile code.
//
// Run state lives in <RunProvider> at this level so it survives the
// dispatcher's child-swap when the viewport crosses 768px (rotation,
// window resize). DesktopRunScreen and MobileRunScreen consume via
// useRunContext() instead of calling useRun() independently. See
// run/RunContext.tsx for the architectural-rule note.

import { lazy, Suspense } from 'react';
import { DesktopRunScreen } from './DesktopRunScreen';
import { RunProvider } from '../run/RunContext';
import { useViewport } from '../run/useViewport';

const MobileRunScreen = lazy(() =>
  import('./mobile/MobileRunScreen').then((m) => ({ default: m.MobileRunScreen })),
);

function MobileFallback() {
  return (
    <div
      data-testid="mobile-suspense-fallback"
      style={{ width: '100%', minHeight: '100vh', background: 'var(--bg-deep)' }}
    />
  );
}

function ActiveBranch() {
  const viewport = useViewport();
  if (viewport === 'desktop') return <DesktopRunScreen />;
  return (
    <Suspense fallback={<MobileFallback />}>
      <MobileRunScreen />
    </Suspense>
  );
}

export function RunScreen() {
  return (
    <RunProvider>
      <ActiveBranch />
    </RunProvider>
  );
}
