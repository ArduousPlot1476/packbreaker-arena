// Adjacency-synergy detector (CF 60; aura pass + role-neutral pair shape,
// CF-89 PR-A). Pure, client-tier. Mirrors the sim's adjacency semantics so the
// arranging-phase surfaces (teal glow, adjacency reveal) light exactly the
// relationships that would matter in combat.
//
// TWO relationship kinds share one pair shape { sourceUid, targetUid, kind }:
//
// kind 'reaction' — the reaction economy (fireAdjacentReactions,
// packages/sim/src/combat.ts:681-712):
//   - 4-dir EDGE adjacency (computeAdjacents, combat.ts:936-942), derived from
//     bag/layout.ts `cellsOf` — cells, not anchors, so rotated/multi-cell
//     items work;
//   - the SOURCE owns an `on_adjacent_trigger` whose TRIGGER-level `matchTags`
//     is empty/absent (match-all, combat.ts:700-704) or intersects the
//     target's tags;
//   - the TARGET has at least one TOP-LEVEL trigger — on_round_start,
//     on_low_health, or on_cooldown (the only fireTrigger(..., true) phases,
//     combat.ts:642-644). on_hit / on_taken_damage fire ONLY as reactions
//     (fireDamageReactions, isTopLevel=false, combat.ts:552-554) and
//     on_adjacent_trigger never provokes (no-cascade, combat.ts:707-709), so
//     none of those can provoke. (Positive membership, not "anything but
//     on_adjacent_trigger": the latter would wrongly count on_hit /
//     on_taken_damage as provokers.)
//
// kind 'aura' — the static-aura economy (CF-89 PR-A; the CF-60 glow-coverage
// fix): the SOURCE owns a `buff_adjacent` EFFECT hosted on a
// NON-on_adjacent_trigger trigger (mana-potion / stamina-tonic on_round_start;
// berserkers-greataxe on_low_health). Eligibility INVERTS relative to
// 'reaction': the TARGET needs NO triggers at all — it only needs to be
// edge-adjacent and pass the EFFECT-level `effect.matchTags ?? []` filter
// (empty = all adjacents; content-schemas.ts § 3 buff_adjacent, "Decoupled
// from the host trigger's matchTags"). The sim applies these buffs in
// resolveEffect's buff_adjacent case (combat.ts:809-850) when the host
// trigger fires.
//
// Item triggers/tags come from the CANONICAL registry via `getItem`: the client
// ItemDef (run/content.ts `adaptItem`) STRIPS triggers, so it cannot drive this
// detector — canonical `getItem` carries both `triggers` and `tags`.

import { getItem } from '@packbreaker/content'
import { cellsOf } from '../bag/layout'
import type { BagItem } from './types'

export type AdjacencyKind = 'reaction' | 'aura'

export interface AdjacencySynergy {
  /** uid of the item that OWNS the relationship: the on_adjacent_trigger
   *  reactor ('reaction') or the buff_adjacent aura emitter ('aura'). */
  readonly sourceUid: string
  /** uid of the adjacent item at the other end: the provoking top-level
   *  trigger owner ('reaction') or the buff recipient ('aura'). */
  readonly targetUid: string
  readonly kind: AdjacencyKind
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** Does the source's on_adjacent_trigger accept this target as a provoker?
 *  TRIGGER-level matchTags; empty/absent = match-all (combat.ts:700-704). */
function reactionAccepts(source: BagItem, target: BagItem): boolean {
  const targetTags = getItem(target.itemId).tags
  for (const t of getItem(source.itemId).triggers) {
    if (t.type !== 'on_adjacent_trigger') continue
    const matchTags = t.matchTags
    if (!matchTags || matchTags.length === 0) return true // match-all
    if (matchTags.some((tag) => targetTags.includes(tag))) return true
  }
  return false
}

/** Can this item fire a TOP-LEVEL trigger (and thus provoke adjacent
 *  reactions)? The top-level set is EXACTLY {on_round_start, on_cooldown,
 *  on_low_health} — see the header. */
export function canProvoke(item: BagItem): boolean {
  return getItem(item.itemId).triggers.some(
    (t) => t.type === 'on_round_start' || t.type === 'on_cooldown' || t.type === 'on_low_health',
  )
}

/** Does any of the source's NON-on_adjacent_trigger triggers host a
 *  buff_adjacent effect whose EFFECT-level matchTags accepts this target?
 *  Empty/absent effect.matchTags = all adjacents (content-schemas.ts § 3). */
function auraAccepts(source: BagItem, target: BagItem): boolean {
  const targetTags = getItem(target.itemId).tags
  for (const t of getItem(source.itemId).triggers) {
    if (t.type === 'on_adjacent_trigger') continue
    for (const e of t.effects) {
      if (e.type !== 'buff_adjacent') continue
      const matchTags = e.matchTags
      if (!matchTags || matchTags.length === 0) return true // all adjacents
      if (matchTags.some((tag) => targetTags.includes(tag))) return true
    }
  }
  return false
}

/** Edge-adjacency map for a bag: uid → the adjacent BagItems, derived from
 *  cells (rotation/multi-cell aware). Shared by the detector and the
 *  arranging-phase reveal model (run/adjacencyReveal.ts). */
export function edgeAdjacencyMap(bag: BagItem[]): Map<string, BagItem[]> {
  const cellOwner = new Map<string, string>()
  for (const b of bag) {
    for (const [x, y] of cellsOf(b)) cellOwner.set(`${x},${y}`, b.uid)
  }
  const byUid = new Map<string, BagItem>(bag.map((b) => [b.uid, b]))

  const out = new Map<string, BagItem[]>()
  for (const b of bag) {
    const uids = new Set<string>()
    for (const [x, y] of cellsOf(b)) {
      for (const [dx, dy] of NEIGHBORS) {
        const u = cellOwner.get(`${x + dx},${y + dy}`)
        if (u && u !== b.uid) uids.add(u)
      }
    }
    out.set(
      b.uid,
      [...uids].map((u) => byUid.get(u)!),
    )
  }
  return out
}

/** Bag → every live adjacency-synergy pair, both kinds. Deterministic order:
 *  sorted by (sourceUid, targetUid, kind). */
export function detectAdjacencySynergies(bag: BagItem[]): AdjacencySynergy[] {
  const adjacency = edgeAdjacencyMap(bag)

  const out: AdjacencySynergy[] = []
  const seen = new Set<string>()
  const push = (sourceUid: string, targetUid: string, kind: AdjacencyKind): void => {
    const key = `${sourceUid}|${targetUid}|${kind}`
    if (seen.has(key)) return
    seen.add(key)
    out.push({ sourceUid, targetUid, kind })
  }

  for (const source of bag) {
    for (const target of adjacency.get(source.uid) ?? []) {
      // 'reaction': source's on_adjacent_trigger accepts a provoking target.
      if (canProvoke(target) && reactionAccepts(source, target)) {
        push(source.uid, target.uid, 'reaction')
      }
      // 'aura': source's non-reaction buff_adjacent reaches the target — the
      // target's own triggers are irrelevant (eligibility inversion).
      if (auraAccepts(source, target)) {
        push(source.uid, target.uid, 'aura')
      }
    }
  }

  out.sort((a, b) =>
    a.sourceUid < b.sourceUid
      ? -1
      : a.sourceUid > b.sourceUid
        ? 1
        : a.targetUid < b.targetUid
          ? -1
          : a.targetUid > b.targetUid
            ? 1
            : a.kind < b.kind
              ? -1
              : a.kind > b.kind
                ? 1
                : 0,
  )
  return out
}
