// Pure scale math. The DOM side of DesignScaleFrame is deliberately NOT tested
// here: happy-dom has no layout engine, so every geometry assertion would be
// vacuously green. Transform application and combat-anchor alignment are
// verified in a real browser via the CDP harness.

import { describe, expect, it } from 'vitest';
import { computeDesignScale, DESIGN_H, DESIGN_W } from './DesignScale';

describe('computeDesignScale', () => {
  it('is 1 at exactly the design size', () => {
    expect(computeDesignScale(DESIGN_W, DESIGN_H)).toBe(1);
  });

  it('takes the CONSTRAINING axis, not the generous one', () => {
    // Wide but short: height binds. Getting this backwards would overflow the
    // viewport vertically, which is the failure the old fixed frame had in
    // reverse.
    expect(computeDesignScale(2560, 720)).toBe(1);
    // Tall but narrow: width binds.
    expect(computeDesignScale(1280, 2000)).toBe(1);
  });

  it('scales UP on a larger monitor — the whole point of the change', () => {
    // 2560×1440 is exactly 2× the design space.
    expect(computeDesignScale(2560, 1440)).toBe(2);
    // 1920×1080 is exactly 1.5×.
    expect(computeDesignScale(1920, 1080)).toBe(1.5);
  });

  it('scales DOWN rather than clipping on a small desktop window', () => {
    // Previously a 1000px-wide window CLIPPED the 1280px frame. Now it fits.
    expect(computeDesignScale(1000, 800)).toBeCloseTo(1000 / DESIGN_W, 5);
    expect(computeDesignScale(1000, 800)).toBeLessThan(1);
  });

  it('clamps to the max so a 5K monitor does not render oversized furniture', () => {
    expect(computeDesignScale(5120, 2880)).toBe(2);
  });

  it('clamps to the min so the HUD never goes sub-legible', () => {
    expect(computeDesignScale(320, 200)).toBe(0.5);
  });

  it('never returns a non-finite or non-positive scale', () => {
    // These feed a DIVISOR in the combat anchor math (CombatScene.anchorBounds),
    // so a 0 or NaN here would produce Infinity/NaN VFX coordinates rather than
    // a merely ugly layout.
    for (const [w, h] of [
      [0, 0],
      [0, 720],
      [1280, 0],
      [Number.NaN, 720],
      [-100, -100],
      [Number.POSITIVE_INFINITY, 720],
    ] as const) {
      const s = computeDesignScale(w, h);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThan(0);
    }
  });
});
