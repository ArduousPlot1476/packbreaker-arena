// Combat-side integration surface between the client and @packbreaker/sim.
//
// This module is the COMBAT-CHUNK counterpart to apps/client/src/run/
// sim-bridge.ts (the shop-side bridge). Only CombatOverlay imports from
// here; nothing in main consumes it. That asymmetry is the entire
// reason the file exists: keeping simulateCombat's static-import edge
// inside the lazy boundary lets Vite chunk-split sim/combat.ts +
// sim/status.ts + sim/triggers.ts into the combat chunk instead of
// hoisting them to main.
//
// Pre-split (M1.3.4a step 2 ratification) runCombat lived in
// run/sim-bridge.ts. ShopController + RunController + ghost.ts all
// imported from that bridge for shop / RNG concerns; the combat chunk
// imported the same bridge for runCombat. Vite's chunk-splitting
// heuristic hoisted the shared bridge to the common ancestor (main),
// dragging simulateCombat (and its transitive sim/combat / status /
// triggers deps) into main. Sourcemap audit at step 6 surfaced the
// leak; the split fixes it.
//
// tech-architecture.md § 10's "title screen ships React + bag UI only"
// promise is satisfied post-split — the combat-only sim subgraph
// ships exclusively in the combat chunk.

import type { CombatInput, CombatResult } from '@packbreaker/content';
import { simulateCombat } from '@packbreaker/sim';

/** Run a combat. Pure delegation to sim's simulateCombat — the only
 *  client-side concern is constructing the CombatInput from client-shape
 *  state (handled at the call site in CombatOverlay; this bridge just
 *  forwards). */
export function runCombat(input: CombatInput): CombatResult {
  return simulateCombat(input);
}
