// CF-85 Surface 1 — per-event item attribution (decision-log.md 2026-07-20
// § "CF-85 SCOPE REDRAWN against Phase-1 read-only …").
//
// Pure module, anchorResolution/koFlashTargets precedent: all attribution
// logic lives here (testable without Phaser); CombatScene consumes the
// output as an index-aligned label array and renders it verbatim.
//
// Attribution rules (per the ratified scope):
//   - damage / heal / item_trigger / status_apply carry `source: ItemRef`
//     ({ side, placementId }) → resolve placementId → itemId against that
//     SIDE's bag, then itemId → display name via the client ITEMS registry.
//   - status_tick is SOURCE-LESS on the wire (content-schemas.ts § 11): a
//     DoT tick attributes by correlating the most recent PRIOR status_apply
//     for the same (target, status) — that apply carries the causing item.
//     Re-application re-points the correlation (last writer wins).
//   - ramp_tick stays UNATTRIBUTED by design — the CF-83 resolution ramp is
//     an environmental drain with no item source; labeling it would invent
//     causality the sim does not claim.
//   - buff_apply / buff_remove / stun_consumed / combat_start / combat_end
//     are deliberately out of Surface 1's scope (their existing floaters
//     already carry their own semantics); they resolve to null.
//
// placementId → itemId needs the side's bag because ItemRef is placement-
// scoped, not item-scoped (Phase-1 report, attribution bound 1). Keys are
// namespaced `${side}:${placementId}` so a player uid and a ghost g0/g1
// can never collide.

import type { CombatEvent, EntityRef, StatusType } from '@packbreaker/content';
import { ITEMS } from '../run/content';
import type { BagItem } from '../run/types';

/** Builds the per-side placementId → item display-name index. Player bag
 *  uids ARE sim placementIds (clientBagToSimBag brand-casts them); ghost
 *  bag items come through simBagToClientBag, whose uid is
 *  String(placementId). Unknown itemIds resolve to null defensively —
 *  never a crash, never a wrong name. */
export function buildPlacementNameIndex(
  playerBag: ReadonlyArray<BagItem>,
  ghostBag: ReadonlyArray<BagItem>,
): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  const addSide = (side: EntityRef, bag: ReadonlyArray<BagItem>) => {
    for (const b of bag) {
      const name = ITEMS[b.itemId]?.name;
      if (name) index.set(`${side}:${b.uid}`, name);
    }
  };
  addSide('player', playerBag);
  addSide('ghost', ghostBag);
  return index;
}

function sourceName(
  index: ReadonlyMap<string, string>,
  source: { side: EntityRef; placementId: string },
): string | null {
  return index.get(`${source.side}:${String(source.placementId)}`) ?? null;
}

/** Index-aligned attribution labels for a CombatResult.events stream.
 *  labels[i] is the display name of the item that caused events[i], or
 *  null when the event is unattributed (ramp_tick, lifecycle events,
 *  out-of-scope types, unresolvable refs).
 *
 *  Single forward walk: the DoT correlation map is updated at each
 *  status_apply BEFORE later status_ticks read it, so "most recent prior
 *  apply for (target, status)" holds by construction — no second pass. */
export function buildEventAttribution(
  events: ReadonlyArray<CombatEvent>,
  playerBag: ReadonlyArray<BagItem>,
  ghostBag: ReadonlyArray<BagItem>,
): ReadonlyArray<string | null> {
  const index = buildPlacementNameIndex(playerBag, ghostBag);
  // (target, status) → the applying item's name. Last writer wins, which
  // is exactly "most recent prior status_apply" under the forward walk.
  const dotSource = new Map<string, string | null>();
  const dotKey = (target: EntityRef, status: StatusType) => `${target}:${status}`;

  return events.map((ev) => {
    switch (ev.type) {
      case 'damage':
      case 'heal':
      case 'item_trigger':
        return sourceName(index, ev.source);
      case 'status_apply': {
        const name = sourceName(index, ev.source);
        dotSource.set(dotKey(ev.target, ev.status), name);
        return name;
      }
      case 'status_tick':
        return dotSource.get(dotKey(ev.target, ev.status)) ?? null;
      default:
        // ramp_tick (unattributed BY DESIGN — CF-83 environmental drain),
        // combat_start/combat_end, stun_consumed, buff_apply/buff_remove.
        return null;
    }
  });
}
