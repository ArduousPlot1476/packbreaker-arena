// Lazy boundary for the combat module per tech-architecture.md § 10:
// "code-split Phaser + combat module — they do not load until first
// combat. Title screen ships React + bag UI only." DesktopRunScreen and
// MobileRunScreen import THIS module instead of CombatOverlay directly,
// so the simulateCombat call path (and its transitive sim modules:
// combat.ts, status.ts, triggers.ts, iteration.ts) only enters the
// bundle when the player presses Continue.
//
// Vite/Rollup tree-shake the sim package per imported symbol, so
// shop-only entries (generateShop, computeRerollCost, createRng) stay in
// the main chunk while sim/combat.ts (and friends) ride the combat chunk
// alongside CombatOverlay + ghost.ts.

import { lazy, Suspense } from 'react';
import type { CombatResult } from '@packbreaker/content';

const CombatOverlayInner = lazy(() =>
  import('./CombatOverlay').then((m) => ({ default: m.CombatOverlay })),
);

interface LazyCombatOverlayProps {
  active: boolean;
  onDone: (result: CombatResult) => void;
}

export function LazyCombatOverlay({ active, onDone }: LazyCombatOverlayProps) {
  if (!active) return null;
  return (
    <Suspense fallback={<CombatLoadingFallback />}>
      <CombatOverlayInner active={active} onDone={onDone} />
    </Suspense>
  );
}

/** Silent overlay during the combat-chunk fetch. Visible only on first
 *  combat of a fresh page load — second combat onward the chunk is in
 *  the browser cache. The overlay is full-bleed dark to match the
 *  CombatOverlay's own background and avoid a flash. */
function CombatLoadingFallback() {
  return (
    <div
      data-testid="combat-suspense-fallback"
      className="absolute inset-0"
      style={{ background: 'rgba(11,15,26,0.78)', zIndex: 50 }}
    />
  );
}
