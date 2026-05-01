// Branch dispatcher per M1.3.3 commit 3 + lazy-loaded mobile per
// commit 8.5 (post-bundle-budget ratification). Reads viewport via
// useViewport (matchMedia at 768px breakpoint) and renders either
// the desktop or mobile orchestrator. The mobile module is loaded
// on-demand via React.lazy — desktop users never parse mobile code.
//
// Per tech-architecture.md § 10 the perf budget cares about
// parse-time as much as transmission, so even the +1.88 KB gzipped
// mobile cost shouldn't ship to desktop. Trey's option-B
// ratification: lazy-load only the additive case (mobile);
// desktop is default and stays synchronous. Phaser will follow
// the same pattern in M1.3.4.
//
// Suspense fallback is a minimal bg-deep block — no loading polish
// per scope guard. M1.3.4 can revisit if the transient is jarring
// during real mobile session start.

import { lazy, Suspense } from 'react';
import { DesktopRunScreen } from './DesktopRunScreen';
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

export function RunScreen() {
  const viewport = useViewport();
  if (viewport === 'desktop') return <DesktopRunScreen />;
  return (
    <Suspense fallback={<MobileFallback />}>
      <MobileRunScreen />
    </Suspense>
  );
}
