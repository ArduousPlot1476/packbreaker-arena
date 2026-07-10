// Adjacency-synergy detector (CF 60). Pure, client-tier. Mirrors the sim's
// fireAdjacentReactions (packages/sim/src/combat.ts:558-589) so the arranging-
// phase glow lights exactly the pairs that would react in combat:
//   - 4-dir EDGE adjacency (combat.ts:157-159), derived from bag/layout.ts
//     `cellsOf` — cells, not anchors, so rotated/multi-cell items work;
//   - the reactor R has an `on_adjacent_trigger` whose `matchTags` is
//     empty/absent (match-all, combat.ts:576-581) or intersects the provoker
//     P's tags;
//   - the provoker P has at least one TOP-LEVEL (non-on_adjacent_trigger)
//     trigger, since only top-level fires provoke reactions — no cascade
//     (combat.ts:540-543).
//
// Item triggers/tags come from the CANONICAL registry via `getItem`: the client
// ItemDef (run/content.ts `adaptItem`) STRIPS triggers, so it cannot drive this
// detector — canonical `getItem` carries both `triggers` and `tags`.

import { getItem } from '@packbreaker/content'
import { cellsOf } from '../bag/layout'
import type { BagItem } from './types'

export interface AdjacencySynergy {
  /** uid of the item whose on_adjacent_trigger would fire */
  readonly reactorUid: string
  /** uid of the adjacent item whose top-level trigger provokes it */
  readonly provokerUid: string
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** Does the provoker (source of a top-level fire) satisfy the reactor's
 *  on_adjacent_trigger matchTags filter? Empty/absent matchTags = match-all
 *  (combat.ts:577). */
function reactorAcceptsProvoker(reactor: BagItem, provoker: BagItem): boolean {
  const provokerTags = getItem(provoker.itemId).tags
  for (const t of getItem(reactor.itemId).triggers) {
    if (t.type !== 'on_adjacent_trigger') continue
    const matchTags = t.matchTags
    if (!matchTags || matchTags.length === 0) return true // match-all
    if (matchTags.some((tag) => provokerTags.includes(tag))) return true
  }
  return false
}

/** Can this item fire a top-level trigger (and thus provoke reactions)? True
 *  iff it has at least one non-on_adjacent_trigger trigger (no-cascade,
 *  combat.ts:540-543 — an item whose only trigger is on_adjacent_trigger can
 *  never provoke). */
function canProvoke(item: BagItem): boolean {
  return getItem(item.itemId).triggers.some((t) => t.type !== 'on_adjacent_trigger')
}

/** Bag → every live adjacency-synergy pair. Both directions can appear when
 *  two items react to each other. Deterministic order: sorted by
 *  (reactorUid, provokerUid). */
export function detectAdjacencySynergies(bag: BagItem[]): AdjacencySynergy[] {
  // cellOwner: "col,row" -> uid, exactly like recipes.ts detectRecipes.
  const cellOwner = new Map<string, string>()
  for (const b of bag) {
    for (const [x, y] of cellsOf(b)) cellOwner.set(`${x},${y}`, b.uid)
  }
  const byUid = new Map<string, BagItem>(bag.map((b) => [b.uid, b]))

  const out: AdjacencySynergy[] = []
  const seen = new Set<string>()
  for (const provoker of bag) {
    if (!canProvoke(provoker)) continue
    // Reactor candidates: items edge-adjacent to any cell of the provoker.
    const adjacentUids = new Set<string>()
    for (const [x, y] of cellsOf(provoker)) {
      for (const [dx, dy] of NEIGHBORS) {
        const u = cellOwner.get(`${x + dx},${y + dy}`)
        if (u && u !== provoker.uid) adjacentUids.add(u)
      }
    }
    for (const reactorUid of adjacentUids) {
      const reactor = byUid.get(reactorUid)!
      if (!reactorAcceptsProvoker(reactor, provoker)) continue
      const key = `${reactorUid}|${provoker.uid}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ reactorUid, provokerUid: provoker.uid })
    }
  }

  out.sort((a, b) =>
    a.reactorUid < b.reactorUid
      ? -1
      : a.reactorUid > b.reactorUid
        ? 1
        : a.provokerUid < b.provokerUid
          ? -1
          : a.provokerUid > b.provokerUid
            ? 1
            : 0,
  )
  return out
}
