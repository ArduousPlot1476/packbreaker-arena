// Production helper bridging resolveAnchor's screen-space output to
// the canvas-local frame Phaser's add.text / add.image consume.
// Used by playEventVisuals's damage, heal, and status_tick branches.
// Generalized in M1.4b2.1 from target-only (M1.4b1) to dual-axis return
// to support heal='both' (decision-log 2026-05-06) and any future
// 'both'-mode events.
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

export interface ResolvedCanvasAnchors {
  readonly source: CanvasAnchor | null;
  readonly target: CanvasAnchor | null;
}

/** Resolve a CombatEvent's source and target anchors in canvas-local
 *  coords. Each axis returns null when the event's ANCHOR_RULE mode
 *  doesn't populate that side:
 *    - 'unanchored' (combat_start) → both null
 *    - 'source' (item_trigger) → source populated, target null
 *    - 'target' (status_tick, status_apply, stun_consumed, buff_*) → source null, target populated
 *    - 'both' (damage, heal post-2026-05-06) → both populated
 *    - 'portrait' (combat_end) → both populated (source=player portrait, target=ghost portrait)
 *
 *  Translation: canvas-local = screen-space − canvasBounds.{left,top}.
 *  In Phaser, this.scale.canvasBounds.{left,top} are the live DOM
 *  position of the canvas; screen-space === canvas-local when the
 *  canvas sits at the document origin. */
export function resolveEventAnchors(
  event: CombatEvent,
  bagLayout: BagLayout,
  canvasBounds: { readonly left: number; readonly top: number },
): ResolvedCanvasAnchors {
  const resolved = resolveAnchor(event, bagLayout);
  return {
    source: resolved.source
      ? { x: resolved.source.x - canvasBounds.left, y: resolved.source.y - canvasBounds.top }
      : null,
    target: resolved.target
      ? { x: resolved.target.x - canvasBounds.left, y: resolved.target.y - canvasBounds.top }
      : null,
  };
}
