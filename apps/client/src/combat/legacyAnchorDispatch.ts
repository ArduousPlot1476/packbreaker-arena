// M1.4b1 Phase 2 SCAFFOLDING — verbatim mirror of the inline anchor
// dispatch in CombatScene.ts:335-363 (`playEventVisuals`), damage +
// status_tick cases only. heal descoped per Phase 1 ratification —
// table-vs-existing mismatch (ANCHOR_RULE.heal='source' but render
// anchors at target) deferred to M1.4b2 where the heal-anchor design
// decision lands alongside source-side VFX.
//
// **This file is deleted in M1.4b1 Phase 3** once playEventVisuals
// consumes resolveAnchor directly. Its only job is to formalize the
// existing inline dispatch as testable pure logic so the Phase 2
// fixture freezes pre-refactor coords + the Phase 3 refactor's
// byte-equality assertion has a frozen baseline.
//
// Pure: no side effects, no Phaser, no scene state. Captures
// anchor-coord selection + coord math from the inline dispatch as a
// function of (event, canvasWidth, canvasHeight). Pre-refactor
// canvas dims = 1280×720; fixture lives at
// apps/client/src/combat/test/fixtures/anchors/.
//
// The literals 0.25 / 0.75 / 0.5 mirror PORTRAIT_X_RATIO_PLAYER /
// PORTRAIT_X_RATIO_GHOST / PORTRAIT_Y_RATIO from CombatScene.ts.
// Hard-coded here (vs. imported) to keep this scaffold's import
// graph Phaser-free for unit-test consumption. Drift risk is bounded
// by Phase 3: any divergence between scaffold and CombatScene
// surfaces when the refactored playEventVisuals fails the same
// fixture assertion this helper feeds.

import type { CombatEvent } from '@packbreaker/content';

export interface LegacyAnchorResult {
  readonly target: { readonly x: number; readonly y: number } | null;
}

/** Mirrors the inline dispatch:
 *    const refs = ev.target === 'player' ? this.playerRefs : this.ghostRefs;
 *  where refs.{centerX, centerY} were set in makePortrait at create()
 *  time as (canvasWidth * PORTRAIT_X_RATIO_{PLAYER,GHOST},
 *  canvasHeight * PORTRAIT_Y_RATIO). For event types with no inline
 *  render path in M1.4b1's scope (heal, status_apply, combat_end,
 *  combat_start, item_trigger, stun_consumed, buff_apply, buff_remove)
 *  returns {target: null}. */
export function legacyAnchorFor(
  event: CombatEvent,
  canvasWidth: number,
  canvasHeight: number,
): LegacyAnchorResult {
  if (event.type === 'damage' || event.type === 'status_tick') {
    const xRatio = event.target === 'player' ? 0.25 : 0.75;
    const yRatio = 0.5;
    return {
      target: { x: canvasWidth * xRatio, y: canvasHeight * yRatio },
    };
  }
  return { target: null };
}
