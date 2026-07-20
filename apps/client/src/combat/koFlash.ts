// koFlash.ts — pure KO-flash target resolution for CombatScene (round-3 P3).
//
// Extracted as a pure module (no Phaser import) so the flash-target decision is
// unit-testable — CombatScene.ts imports Phaser and cannot load in the test
// environment, the same reason anchorResolution.ts lives apart from the scene.

import type { CombatOutcome, EntityRef } from '@packbreaker/content';

/** Which portrait(s) receive the terminal KO flash for a combat outcome.
 *
 *  CF-84 honest render: a decisive win flashes EXACTLY the loser's portrait; a
 *  mutual-KO draw flashes BOTH — both combatants died. Before CF-83 a ramp-only
 *  stall draw hit the zero-content fast-skip and never mounted Phaser; adding
 *  `ramp_tick` to MEANINGFUL_EVENT_TYPES now routes those draws through the
 *  scene, so the draw case is reachable and must show both deaths (the previous
 *  two-way branch flashed only the player). */
export function koFlashTargets(outcome: CombatOutcome): readonly EntityRef[] {
  if (outcome === 'player_win') return ['ghost'];
  if (outcome === 'ghost_win') return ['player'];
  return ['player', 'ghost']; // draw — both died
}
