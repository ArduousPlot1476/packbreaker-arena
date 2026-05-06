// M1.4b1 Phase 3 visual-no-op assertion: resolveEventTargetAnchor
// (the production helper consumed by playEventVisuals's damage and
// status_tick branches) produces canvas-local anchor coords
// byte-equal to Phase 2's frozen fixture for burn-application.
//
// The fixture coords were captured at canvas dimensions 1280×720 with
// the canvas at the document origin (canvasBounds = {left: 0, top: 0}).
// Synthesizing the BagLayout that CombatOverlay would have produced
// at those dimensions and feeding the same canvasBounds gives
// canvas-local outputs that must match the frozen fixture entry-for-
// entry. A pixel of drift fails the test.

import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '@packbreaker/content';
import simFixture from '../../../../packages/sim/test/fixtures/combats/burn-application.json';
import anchorFixture from './test/fixtures/anchors/burn-application.json';
import { resolveEventTargetAnchor } from './eventAnchorResolver';
import type { BagLayout } from '../bag/layout';

const W = anchorFixture.canvasWidth;
const H = anchorFixture.canvasHeight;
const IN_SCOPE: ReadonlySet<CombatEvent['type']> = new Set(['damage', 'status_tick']);

/** Synthesize the BagLayout CombatOverlay would have produced at
 *  canvas dimensions WxH, with the canvas top-left at
 *  (canvasLeft, canvasTop) in screen-space. Portrait anchors derive
 *  from PORTRAIT_X_RATIO_PLAYER / PORTRAIT_X_RATIO_GHOST /
 *  PORTRAIT_Y_RATIO via canvas-rect projection (M1.4a Ratification 1). */
function buildLayout(canvasLeft: number, canvasTop: number): BagLayout {
  return {
    cellSize: 88,
    dimensions: { width: 6, height: 4 },
    player: {
      itemAnchors: new Map(),
      portraitAnchor: { x: canvasLeft + W * 0.25, y: canvasTop + H * 0.5 },
    },
    ghost: {
      itemAnchors: new Map(),
      portraitAnchor: { x: canvasLeft + W * 0.75, y: canvasTop + H * 0.5 },
    },
  };
}

describe('resolveEventTargetAnchor — frozen-fixture byte-equality (burn-application)', () => {
  const events = simFixture.expectedEvents as ReadonlyArray<CombatEvent>;
  const { anchors } = anchorFixture;
  const layoutAtOrigin = buildLayout(0, 0);
  const canvasBoundsAtOrigin = { left: 0, top: 0 };

  it('fixture covers every event in the sim fixture (count match)', () => {
    expect(anchors.length).toBe(events.length);
  });

  events.forEach((event, i) => {
    if (!IN_SCOPE.has(event.type)) return;
    it(`event[${i}] (${event.type}) target anchor matches frozen fixture`, () => {
      const expected = anchors[i];
      expect(expected).toBeDefined();
      expect(expected!.eventIndex).toBe(i);
      expect(expected!.eventType).toBe(event.type);
      const actual = resolveEventTargetAnchor(event, layoutAtOrigin, canvasBoundsAtOrigin);
      expect(actual).toEqual(expected!.target);
    });
  });

  it('canvas-local translation invariant: shifting canvas origin produces same canvas-local coords', () => {
    // Layout's screen-space portraitAnchor scales with canvasLeft/Top;
    // helper subtracts the same origin → result is invariant.
    const offset = { left: 150, top: 250 };
    const layoutOffset = buildLayout(offset.left, offset.top);
    const damageEv = events.find((ev) => ev.type === 'damage');
    expect(damageEv).toBeDefined();
    const atOrigin = resolveEventTargetAnchor(damageEv!, layoutAtOrigin, canvasBoundsAtOrigin);
    const atOffset = resolveEventTargetAnchor(damageEv!, layoutOffset, offset);
    expect(atOffset).toEqual(atOrigin);
  });

  it('returns null for events whose ANCHOR_RULE mode does not populate target', () => {
    // combat_start is 'unanchored' → resolveAnchor returns {} →
    // helper returns null. Heal is 'source' → resolveAnchor returns
    // {source: ...} with no target → helper also returns null.
    const startEv = events.find((ev) => ev.type === 'combat_start');
    expect(startEv).toBeDefined();
    expect(resolveEventTargetAnchor(startEv!, layoutAtOrigin, canvasBoundsAtOrigin)).toBeNull();
  });
});
