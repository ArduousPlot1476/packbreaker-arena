// M1.4b1 Phase 2 assertion: legacyAnchorFor produces anchor coords
// matching the frozen fixture for burn-application damage +
// status_tick events.
//
// Pre-refactor (Phase 2): asserts the verbatim-mirror helper output
// against the canvas-local coords frozen at 1280×720. Sanity-checks
// that the helper actually reflects the inline dispatch and the JSON
// is internally consistent.
//
// Post-refactor (Phase 3): the same fixture will be asserted against
// the refactored playEventVisuals (via resolveAnchor + screen-space
// → canvas-local translation). A pixel of drift fails the test.
// Hold the fixture frozen across Phase 3.

import { describe, expect, it } from 'vitest';
import type { CombatEvent } from '@packbreaker/content';
import simFixture from '../../../../packages/sim/test/fixtures/combats/burn-application.json';
import anchorFixture from './test/fixtures/anchors/burn-application.json';
import { legacyAnchorFor } from './legacyAnchorDispatch';

const IN_SCOPE: ReadonlySet<CombatEvent['type']> = new Set(['damage', 'status_tick']);

describe('legacyAnchorFor — frozen-fixture byte-equality (burn-application)', () => {
  const events = simFixture.expectedEvents as ReadonlyArray<CombatEvent>;
  const { canvasWidth, canvasHeight, anchors } = anchorFixture;

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
      const actual = legacyAnchorFor(event, canvasWidth, canvasHeight);
      expect(actual.target).toEqual(expected!.target);
    });
  });
});
