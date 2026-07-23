// Arranging-phase adjacency-buff replica + reveal model (CF-89 PR-A).
//
// Client-side STATIC replica of the sim's buff_adjacent resolution, per the
// ratified scope fork (decision-log.md 2026-07-22 § "CF-89 L1/L2 PHASE 1
// RATIFIED …" § 1): no shared pure helper exists sim-side, so this module
// composes the CF-60 detector's adjacency map + canonical `getItem` + the
// sim-exported `applyPct`, replicating four verified sim rules:
//   1. STACKING/DEDUPE (combat.ts:819-830): different sources to the same
//      (target, stat) stack ADDITIVELY; the same (source, target, stat) tuple
//      applies ONCE (re-application is a no-op) — statically, each source item
//      contributes at most one amount per (target, stat).
//   2. DURATION (combat.ts:832): every shipped buff_adjacent omits
//      durationTicks → -1 = full combat, so a static value is faithful.
//   3. TARGETING (combat.ts:727): a damage buff keys on the FIRING item — it
//      raises ALL of that item's damage effects.
//   4. FLOORING: applyPct = Math.floor((base*(100+pct))/100), IMPORTED from
//      the sim (never re-implemented). Deep-subpath import per the Phase-2.5i
//      lazy-boundary precedent (useRun.ts:32-41): this module is reachable
//      from main-chunk BagBoard, and sim's root barrel re-exports
//      simulateCombat; math.ts imports nothing.
//
// SCOPE BOUNDARY (ratified § 2): the model computes the ADJACENCY DELTA only —
// base → base + adjacency buffs. sideStats.bonusBaseDamage (class/relic) is
// deliberately NOT folded in; the card is labeled as the adjacency
// contribution, never "final damage". L4 territory.
//
// THREE DISPLAY CLASSES (ratified § 2):
//   class 1 DETERMINISTIC — on_round_start-hosted auras (active from tick 0:
//     TICK_PHASES puts round_start before cooldowns, iteration.ts:87-94) and
//     on_adjacent_trigger buffs (active from the provoker's FIRST fire —
//     reaction-before-effects, combat.ts:636-644) → resolved after-values.
//   class 2 CONDITIONAL/PROBABILISTIC — a conditional host trigger
//     (on_low_health) OR stat trigger_chance_pct (echo = chanceRng roll,
//     combat.ts:660-671) → label only, NEVER a flat after-value. Class-2
//     amounts are EXCLUDED from the deterministic totals below.
//   class 3 OPPONENT-STATUS REACTION — on_adjacent_trigger whose effect is
//     not buff_adjacent (spark-stone / fire-oil apply_status at opponent) →
//     condition + effect, NO affected panel (no adjacent item is affected).
//
// AFFECTED-SET RULE (ratified § 2, the correctness ruling): for a reaction
// buff the affected set is the EFFECT-matchTags-filtered ADJACENT set, gated
// on at least one provoker existing — NOT the provoker set. (Whetstone beside
// Iron Sword + Vampire Fang: the sword provokes, the reaction buffs BOTH
// weapons.)

import { applyPct } from '@packbreaker/sim/src/math'
import { getItem } from '@packbreaker/content'
import type { Item, ItemTag, Trigger } from '@packbreaker/content'
import { describeEffect, triggerCondition } from '../items/describeItem'
import { canProvoke, edgeAdjacencyMap } from './adjacency'
import type { BagItem } from './types'

export type RevealClass = 1 | 2 | 3

/** Deterministic (class-1) adjacency buffs RECEIVED by an item. */
export interface ReceivedBuffs {
  /** Flat addition to every damage effect the item fires (sim rule 3). */
  damage: number
  /** Percent applied to cooldownTicks via applyPct (negative = faster). */
  cooldownPct: number
}

export interface AffectedDelta {
  readonly kind: 'damage' | 'cooldown'
  /** damage: the effect's base amount · cooldown: base cooldownTicks. */
  readonly before: number
  /** damage: base + total received damage buffs · cooldown:
   *  applyPct(base, total received cooldown pct). */
  readonly after: number
}

export interface AffectedRef {
  readonly uid: string
  readonly name: string
  /** Resolved before→after pairs (class-1 rows only; [] when the target has
   *  no effect the stat can move — the buff still exists on it, latent, so it
   *  stays LISTED: the Vampire Fang case). */
  readonly deltas: ReadonlyArray<AffectedDelta>
}

export interface RevealRow {
  readonly revealClass: RevealClass
  /** "Condition — effect", built from describeItem's own formatters. */
  readonly text: string
  /** Class-2 qualifier ("if triggered" / "chance on trigger"); null else. */
  readonly qualifier: string | null
  /** Affected adjacent items. null = SUPPRESS the panel entirely (class 3);
   *  [] = panel with its empty state (e.g. a gated reaction buff with no
   *  provoker adjacent). Class-2 entries carry no deltas. */
  readonly affected: ReadonlyArray<AffectedRef> | null
}

function tagsMatch(matchTags: ReadonlyArray<ItemTag> | undefined, item: Item): boolean {
  if (!matchTags || matchTags.length === 0) return true
  return matchTags.some((tag) => item.tags.includes(tag))
}

/** Is this host trigger's buff deterministic at arrange time? Per the ratified
 *  class-1 set: on_round_start auras + on_adjacent_trigger reaction buffs.
 *  Everything else (on_low_health today; any future host) is conditional. */
function deterministicHost(trigger: Trigger): boolean {
  return trigger.type === 'on_round_start' || trigger.type === 'on_adjacent_trigger'
}

/** Sim rule 1 statically: per SOURCE item, at most one contribution per
 *  (target, stat); different sources stack additively. Only class-1 buffs
 *  (deterministic host + damage/cooldown_pct stat) enter the totals; the
 *  reaction-host contribution is gated on ≥1 adjacent provoker. */
export function computeAdjacencyBuffTotals(bag: BagItem[]): Map<string, ReceivedBuffs> {
  const adjacency = edgeAdjacencyMap(bag)
  const totals = new Map<string, ReceivedBuffs>()
  const add = (uid: string, stat: 'damage' | 'cooldown_pct', amount: number): void => {
    const t = totals.get(uid) ?? { damage: 0, cooldownPct: 0 }
    if (stat === 'damage') t.damage += amount
    else t.cooldownPct += amount
    totals.set(uid, t)
  }

  for (const source of bag) {
    const def = getItem(source.itemId)
    const adjacents = adjacency.get(source.uid) ?? []
    // Sim rule 1: one contribution per (source, target, stat) — first wins.
    const applied = new Set<string>()

    for (const trigger of def.triggers) {
      if (!deterministicHost(trigger)) continue
      // Reaction-host gate (ratified): the buff only ever fires if at least
      // one adjacent item can provoke this trigger (trigger-level matchTags).
      if (trigger.type === 'on_adjacent_trigger') {
        const hasProvoker = adjacents.some(
          (a) => canProvoke(a) && tagsMatch(trigger.matchTags, getItem(a.itemId)),
        )
        if (!hasProvoker) continue
      }
      for (const effect of trigger.effects) {
        if (effect.type !== 'buff_adjacent') continue
        if (effect.stat !== 'damage' && effect.stat !== 'cooldown_pct') continue
        for (const target of adjacents) {
          if (!tagsMatch(effect.matchTags, getItem(target.itemId))) continue
          const key = `${target.uid}|${effect.stat}`
          if (applied.has(key)) continue
          applied.add(key)
          add(target.uid, effect.stat, effect.amount)
        }
      }
    }
  }
  return totals
}

/** Resolved before→after deltas for one affected item, from the TOTAL
 *  deterministic adjacency buffs it receives (sim-consistent: the sim sums
 *  across sources, so a per-source partial number would be false). Only the
 *  stats this row's effect moves are rendered. */
function deltasFor(
  target: BagItem,
  stat: 'damage' | 'cooldown_pct',
  totals: Map<string, ReceivedBuffs>,
): AffectedDelta[] {
  const def = getItem(target.itemId)
  const received = totals.get(target.uid) ?? { damage: 0, cooldownPct: 0 }
  const out: AffectedDelta[] = []
  const seen = new Set<string>()

  for (const trigger of def.triggers) {
    if (stat === 'damage') {
      if (received.damage === 0) continue
      for (const effect of trigger.effects) {
        if (effect.type !== 'damage') continue
        const key = `d|${effect.amount}`
        if (seen.has(key)) continue // identical base amounts render once
        seen.add(key)
        out.push({ kind: 'damage', before: effect.amount, after: effect.amount + received.damage })
      }
    } else {
      if (received.cooldownPct === 0) continue
      if (trigger.type !== 'on_cooldown') continue
      const key = `c|${trigger.cooldownTicks}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        kind: 'cooldown',
        before: trigger.cooldownTicks,
        // Sim formula verbatim (combat.ts:433): applyPct(baseCd, cdBuffSum).
        after: applyPct(trigger.cooldownTicks, received.cooldownPct),
      })
    }
  }
  return out
}

/** The reveal rows for one bag item — its ADJACENCY relationships only.
 *  Non-adjacency triggers (e.g. master-alchemists-kit's on_round_start
 *  poison) stay in describeItem's existing lines; the card is an adjacency
 *  section, not a describeItem replacement (ratified § 3 boundary). */
export function computeItemRevealRows(bag: BagItem[], uid: string): RevealRow[] {
  const source = bag.find((b) => b.uid === uid)
  if (!source) return []
  const def = getItem(source.itemId)
  const adjacency = edgeAdjacencyMap(bag)
  const adjacents = adjacency.get(uid) ?? []
  const totals = computeAdjacencyBuffTotals(bag)

  const rows: RevealRow[] = []
  for (const trigger of def.triggers) {
    const isReactionHost = trigger.type === 'on_adjacent_trigger'
    // Per-trigger provoker gate, hoisted above the effects loop (Codex PR-57
    // round-1 P2): an on_adjacent_trigger can only ever fire if at least one
    // adjacent item can provoke it (trigger-level matchTags). The expression
    // reads only trigger + adjacents, so hoisting is behavior-identical for
    // the buff rows below. Non-reaction hosts are always open.
    const gateOpen = !isReactionHost
      ? true
      : adjacents.some((a) => canProvoke(a) && tagsMatch(trigger.matchTags, getItem(a.itemId)))
    for (const effect of trigger.effects) {
      if (effect.type === 'buff_adjacent') {
        // Aura or reaction buff — an adjacency row either way.
        const probabilistic = effect.stat === 'trigger_chance_pct'
        const conditional = !deterministicHost(trigger)
        const revealClass: RevealClass = probabilistic || conditional ? 2 : 1
        const affectedItems = adjacents.filter((a) => tagsMatch(effect.matchTags, getItem(a.itemId)))
        // Ratified affected-set rule: effect-matchTags-filtered adjacents,
        // gated (reaction hosts) on ≥1 provoker existing.
        const affected: AffectedRef[] = (gateOpen ? affectedItems : []).map((a) => ({
          uid: a.uid,
          name: getItem(a.itemId).name,
          deltas:
            revealClass === 1 && effect.stat !== 'trigger_chance_pct'
              ? deltasFor(a, effect.stat, totals)
              : [],
        }))
        // No dangling "condition — " when the effect renders to nothing
        // (describeItem's own rule for zero-amount buffs).
        const effectText = describeEffect(effect)
        if (effectText == null) continue
        rows.push({
          revealClass,
          text: `${triggerCondition(trigger)} — ${effectText}`,
          qualifier:
            revealClass === 2 ? (probabilistic ? 'chance on trigger' : 'if triggered') : null,
          affected,
        })
      } else if (isReactionHost) {
        // Class 3: an on_adjacent_trigger whose effect lands elsewhere
        // (apply_status at the opponent today). Condition + effect only —
        // no adjacent item is affected, so the panel is SUPPRESSED (null).
        //
        // Gate-closed → suppress the ROW entirely (Codex PR-57 round-1 P2,
        // ratified rationale): suppression makes the card agree with the
        // board. The detector emits no reaction pair for a provokerless
        // layout, so the item does not glow; a card row on a non-glowing
        // item asserts a relationship the board denies. (Class-1/2 rows
        // keep their gate-closed row + honest empty state — they have an
        // affected panel to carry it; panel-availability is secondary.)
        if (!gateOpen) continue
        const effectText = describeEffect(effect)
        if (effectText == null) continue
        rows.push({
          revealClass: 3,
          text: `${triggerCondition(trigger)} — ${effectText}`,
          qualifier: null,
          affected: null,
        })
      }
      // Non-adjacency effects on non-reaction triggers: not an adjacency
      // relationship — describeItem's existing lines already cover them.
    }
  }
  return rows
}

/** Chip entries for an OPEN reveal: the class-1 affected targets of `uid`
 *  with a nonzero received total (chips are resolved-number surfaces, so
 *  class-2/latent-zero targets get none). */
export interface ChipEntry {
  readonly uid: string
  readonly damage: number
  readonly cooldownPct: number
}

export function computeChipEntries(bag: BagItem[], uid: string): ChipEntry[] {
  const rows = computeItemRevealRows(bag, uid)
  const totals = computeAdjacencyBuffTotals(bag)
  const out = new Map<string, ChipEntry>()
  for (const row of rows) {
    if (row.revealClass !== 1 || row.affected === null) continue
    for (const a of row.affected) {
      const t = totals.get(a.uid)
      if (!t || (t.damage === 0 && t.cooldownPct === 0)) continue
      out.set(a.uid, { uid: a.uid, damage: t.damage, cooldownPct: t.cooldownPct })
    }
  }
  return [...out.values()]
}
