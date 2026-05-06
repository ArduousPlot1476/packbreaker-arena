// M1.4b1 Phase 3 visual-no-op assertion: resolveEventAnchors (the
// production helper consumed by playEventVisuals's damage, heal, and
// status_tick branches) produces canvas-local anchor coords byte-equal
// to frozen fixtures.
//
// Two fixture suites:
//   - burn-application (M1.4b1, target-axis only): one-sided ghost-target
//     combat. Locks target-axis byte-equality on the M1.4b1 surface.
//   - on-hit-vampire-fang (M1.4b2.1, dual-axis CF 26 + CF 28): two-sided
//     combat with player-branch heal events + player-source items.
//     Locks source AND target axis byte-equality, exercising heal='both'
//     post-decision-log 2026-05-06 + the player-branch coverage gap.
//
// Independent-oracle discipline lives in anchorResolution.test.ts
// per-row tests (hand-coded coords). These fixtures use compute-via-
// production-helper-and-freeze; drift = bug, no auto-regenerate.

import { describe, expect, it } from 'vitest';
import type { CombatEvent, PlacementId } from '@packbreaker/content';
import simFixture from '../../../../packages/sim/test/fixtures/combats/burn-application.json';
import anchorFixture from './test/fixtures/anchors/burn-application.json';
import vampireFangSim from '../../../../packages/sim/test/fixtures/combats/on-hit-vampire-fang.json';
import vampireFangAnchors from './test/fixtures/anchors/on-hit-vampire-fang.json';
import { resolveEventAnchors } from './eventAnchorResolver';
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

// Vampire-fang synthetic itemAnchors. Round numbers chosen for
// deterministic test output + clear visual distinction from portrait
// coords (320,360) / (960,360); NOT a mirror of computeBagLayout's real
// output. Frozen here means frozen in vampireFangAnchors fixture too;
// changing these requires regenerating the fixture (ratification gate).
const VF_PLAYER_P1 = { x: 100, y: 200 } as const;
const VF_PLAYER_P2 = { x: 200, y: 200 } as const;
const VF_GHOST_G1 = { x: 1080, y: 200 } as const;

function buildVampireFangLayout(canvasLeft: number, canvasTop: number): BagLayout {
  return {
    cellSize: 88,
    dimensions: { width: 6, height: 4 },
    player: {
      itemAnchors: new Map<PlacementId, { x: number; y: number }>([
        ['p1' as PlacementId, { x: canvasLeft + VF_PLAYER_P1.x, y: canvasTop + VF_PLAYER_P1.y }],
        ['p2' as PlacementId, { x: canvasLeft + VF_PLAYER_P2.x, y: canvasTop + VF_PLAYER_P2.y }],
      ]),
      portraitAnchor: { x: canvasLeft + W * 0.25, y: canvasTop + H * 0.5 },
    },
    ghost: {
      itemAnchors: new Map<PlacementId, { x: number; y: number }>([
        ['g1' as PlacementId, { x: canvasLeft + VF_GHOST_G1.x, y: canvasTop + VF_GHOST_G1.y }],
      ]),
      portraitAnchor: { x: canvasLeft + W * 0.75, y: canvasTop + H * 0.5 },
    },
  };
}

describe('resolveEventAnchors — frozen-fixture byte-equality (burn-application, target axis)', () => {
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
      const actual = resolveEventAnchors(event, layoutAtOrigin, canvasBoundsAtOrigin);
      expect(actual.target).toEqual(expected!.target);
    });
  });

  it('canvas-local translation invariant: shifting canvas origin produces same canvas-local target coords', () => {
    // Layout's screen-space portraitAnchor scales with canvasLeft/Top;
    // helper subtracts the same origin → result is invariant.
    const offset = { left: 150, top: 250 };
    const layoutOffset = buildLayout(offset.left, offset.top);
    const damageEv = events.find((ev) => ev.type === 'damage');
    expect(damageEv).toBeDefined();
    const atOrigin = resolveEventAnchors(damageEv!, layoutAtOrigin, canvasBoundsAtOrigin);
    const atOffset = resolveEventAnchors(damageEv!, layoutOffset, offset);
    expect(atOffset.target).toEqual(atOrigin.target);
  });

  it('combat_start (unanchored mode) returns null for both source and target', () => {
    // combat_start is 'unanchored' → resolveAnchor returns {} → helper
    // returns {source: null, target: null}. Burn-application's heal
    // events do not exist (one-sided combat), so heal='both' post-flip
    // does not reshape this fixture's expected outputs.
    const startEv = events.find((ev) => ev.type === 'combat_start');
    expect(startEv).toBeDefined();
    const result = resolveEventAnchors(startEv!, layoutAtOrigin, canvasBoundsAtOrigin);
    expect(result.source).toBeNull();
    expect(result.target).toBeNull();
  });
});

describe('resolveEventAnchors — frozen-fixture byte-equality (on-hit-vampire-fang, dual axis: CF 26 source-side + CF 28 player-branch)', () => {
  // M1.4b2.1 fixture. Sim fixture sourced from packages/sim
  // determinism suite (LOCKED). Anchor fixture frozen via production
  // helper at fixture-creation time against the synthesized BagLayout
  // below; drift = bug.
  const events = vampireFangSim.expectedEvents as ReadonlyArray<CombatEvent>;
  const { anchors } = vampireFangAnchors;
  const layoutAtOrigin = buildVampireFangLayout(0, 0);
  const canvasBoundsAtOrigin = { left: 0, top: 0 };

  it('fixture covers every event in the sim fixture (count match)', () => {
    expect(anchors.length).toBe(events.length);
  });

  events.forEach((event, i) => {
    it(`event[${i}] (${event.type}) source + target anchors match frozen fixture`, () => {
      const expected = anchors[i];
      expect(expected).toBeDefined();
      expect(expected!.eventIndex).toBe(i);
      expect(expected!.eventType).toBe(event.type);
      const actual = resolveEventAnchors(event, layoutAtOrigin, canvasBoundsAtOrigin);
      expect(actual.source).toEqual(expected!.source);
      expect(actual.target).toEqual(expected!.target);
    });
  });

  it('canvas-local translation invariant on source axis: shifting canvas origin produces same canvas-local source coords (heal event)', () => {
    // Same invariant as the target-axis test on burn-application; the
    // source axis on heal events exercises the player.itemAnchors path
    // (vampire-fang at p2), not the portrait fallback.
    const offset = { left: 150, top: 250 };
    const layoutOffset = buildVampireFangLayout(offset.left, offset.top);
    const healEv = events.find((ev) => ev.type === 'heal');
    expect(healEv).toBeDefined();
    const atOrigin = resolveEventAnchors(healEv!, layoutAtOrigin, canvasBoundsAtOrigin);
    const atOffset = resolveEventAnchors(healEv!, layoutOffset, offset);
    expect(atOffset.source).toEqual(atOrigin.source);
    expect(atOffset.target).toEqual(atOrigin.target);
  });
});
