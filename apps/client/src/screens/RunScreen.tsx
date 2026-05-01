// Branch dispatcher per M1.3.3 commit 3. Reads viewport via
// useViewport (matchMedia at 768px breakpoint) and renders either
// the desktop or mobile orchestrator. Two orchestrators share
// primitives (bag/, shop/, hud/, ui-kit) but differ in layout +
// @dnd-kit sensor wiring (mobile adds TouchSensor in commit 7).
//
// main.tsx imports RunScreen from this file unchanged across the
// rename — the exported name is preserved.

import { DesktopRunScreen } from './DesktopRunScreen';
import { MobileRunScreen } from './mobile/MobileRunScreen';
import { useViewport } from '../run/useViewport';

export function RunScreen() {
  const viewport = useViewport();
  return viewport === 'mobile' ? <MobileRunScreen /> : <DesktopRunScreen />;
}
