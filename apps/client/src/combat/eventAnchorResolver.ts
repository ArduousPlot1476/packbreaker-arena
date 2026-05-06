// Production helper bridging resolveAnchor's screen-space output to
// the canvas-local frame Phaser's add.text / add.image consume.
// Used by playEventVisuals's damage and status_tick branches as the
// M1.4b1 visual-no-op refactor lift; M1.4b2 may extend.
//
// § 4.5 R1: ANCHOR_RULE design intent stays the predicate of record;
// this helper does NOT re-derive "where does this event anchor" — it
// reads resolveAnchor's verdict and translates the coord frame.
// § 4.5 R2: pixel positions read from BagLayout (via resolveAnchor)
// and canvasBounds; never recomputed from layout.cellSize +
// layout.dimensions.

import type { CombatEvent } from '@packbreaker/content';
import { resolveAnchor } from './anchorResolution';
import type { BagLayout } from '../bag/layout';

export interface CanvasAnchor {
  readonly x: number;
  readonly y: number;
}

/** Resolve a CombatEvent's target anchor in canvas-local coords.
 *
 *  Returns null when the event's ANCHOR_RULE mode doesn't populate a
 *  target anchor (combat_start, item_trigger, heal-via-mode='source',
 *  unanchored events, etc.). M1.4b1 production callers in
 *  playEventVisuals (damage, status_tick) are guaranteed non-null by
 *  the table — damage='both' and status_tick='target' both populate
 *  target — but the null-return path is the explicit contract for
 *  any future caller whose mode might not.
 *
 *  Translation: canvas-local = screen-space − canvasBounds.{left,top}.
 *  In Phaser, this.scale.canvasBounds.{left,top} are the live DOM
 *  position of the canvas; screen-space === canvas-local when the
 *  canvas sits at the document origin. */
export function resolveEventTargetAnchor(
  event: CombatEvent,
  bagLayout: BagLayout,
  canvasBounds: { readonly left: number; readonly top: number },
): CanvasAnchor | null {
  const resolved = resolveAnchor(event, bagLayout);
  const target = resolved.target;
  if (!target) return null;
  return {
    x: target.x - canvasBounds.left,
    y: target.y - canvasBounds.top,
  };
}
