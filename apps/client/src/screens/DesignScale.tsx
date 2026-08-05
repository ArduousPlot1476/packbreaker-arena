// Design-space scaling for the desktop run screen.
//
// The desktop layout is authored against a fixed 1280×720 design space
// (gdd.md § 14) and every absolute-positioned atom in screens/class-select and
// the rail widths depend on those exact numbers. Until now the frame was
// literally `width: 1280, height: 720, margin: '0 auto'`, so a 2560×1440
// monitor showed a small letterboxed island and a 1000px-wide window CLIPPED.
//
// Rather than reflow the layout — which would invalidate the entire design-board
// port — the frame keeps its 1280×720 coordinate space and is scaled to fit the
// viewport with a CSS transform. Every constant in the layout stays true; only
// the final rasterization changes. The UI is vector (inline SVG icons, CSS
// borders, text), so it stays crisp at any scale.
//
// ─── The coordinate-frame consequence, which is load-bearing ───────────────
//
// A CSS transform does NOT change layout geometry. Inside the scaled subtree an
// element still measures 1280 layout px wide, but getBoundingClientRect() reports
// its SCALED on-screen size. Anything that mixes the two frames breaks.
//
// The combat VFX handshake does exactly that mixing: it reads the bag's origin
// via getBoundingClientRect (screen space) and composes it with `col * cellSize`
// (design space). At scale 1 those frames coincide, which is why it worked.
// At any other scale it would drift. CombatOverlay therefore divides its rect
// reads by this scale to land everything back in design space, and CombatScene
// divides Phaser's canvasBounds by the same number. See the comments at both
// sites — the division is not incidental.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** The authored desktop design space (gdd.md § 14). */
export const DESIGN_W = 1280;
export const DESIGN_H = 720;

/** Don't shrink past this — below it the 12px HUD labels stop being legible, and
 *  the mobile branch (< 768px) is the right answer for anything that small. */
const MIN_SCALE = 0.5;

/** Don't grow past this. Beyond ~2× the layout reads as oversized furniture on a
 *  large monitor rather than as a game filling the screen, and line weights that
 *  were tuned at 1px start looking heavy. */
const MAX_SCALE = 2;

export function computeDesignScale(viewportW: number, viewportH: number): number {
  const raw = Math.min(viewportW / DESIGN_W, viewportH / DESIGN_H);
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
}

const DesignScaleContext = createContext<number>(1);

/** Live scale factor mapping design space → screen space. Read this anywhere a
 *  screen-space measurement has to be reconciled with a design-space constant. */
export function useDesignScale(): number {
  return useContext(DesignScaleContext);
}

/** Centers a DESIGN_W × DESIGN_H frame in the viewport, scaled to fit.
 *
 *  `children` render inside the scaled frame and see the untouched 1280×720
 *  coordinate space. `overlay` renders OUTSIDE it, in true screen space — that
 *  is where dnd-kit's DragOverlay has to live, because dnd-kit positions the
 *  drag preview from pointer coordinates, which are screen space and would be
 *  double-transformed inside the frame. */
export function DesignScaleFrame({
  children,
  overlay,
}: {
  children: ReactNode;
  overlay?: ReactNode;
}) {
  const scale = useViewportScale();
  return (
    <DesignScaleContext.Provider value={scale}>
      <div
        data-testid="design-scale-root"
        data-scale={scale}
        style={{
          width: '100%',
          minHeight: '100vh',
          background: 'var(--bg-deep)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: DESIGN_W,
            height: DESIGN_H,
            transform: `scale(${scale})`,
            // Centre origin so the flex centring above needs no compensating
            // offset — the element's layout box stays 1280×720 either way.
            transformOrigin: 'center center',
            position: 'relative',
            flex: '0 0 auto',
          }}
        >
          {children}
        </div>
      </div>
      {overlay}
    </DesignScaleContext.Provider>
  );
}

/** Tracks the viewport and returns the current scale. Split out so the value is
 *  computed once per resize rather than per render. */
function useViewportScale(): number {
  const [scale, setScale] = useState(() =>
    typeof window === 'undefined'
      ? 1
      : computeDesignScale(window.innerWidth, window.innerHeight),
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const recompute = () => setScale(computeDesignScale(window.innerWidth, window.innerHeight));
    recompute();
    window.addEventListener('resize', recompute);
    // Covers the desktop case the resize event misses: dragging the window to a
    // monitor with a different devicePixelRatio fires neither resize nor
    // orientationchange in some browsers, but does re-run media queries.
    const dpr = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dpr.addEventListener?.('change', recompute);
    return () => {
      window.removeEventListener('resize', recompute);
      dpr.removeEventListener?.('change', recompute);
    };
  }, []);

  return scale;
}
