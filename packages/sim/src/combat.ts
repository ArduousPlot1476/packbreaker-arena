// combat.ts — M1.2.3b combat resolver core. simulateCombat(input, options?)
// runs the canonical tick loop and produces the full CombatEvent[] replay log.
//
// Determinism: every code path is integer-only (HP, damage, cooldowns), driven
// by a single Rng seeded from input.seed, iterates placements via
// canonicalPlacements, and consumes no environment time. The byte-identical
// replay invariant lives or dies here.
//
// Locked answers honored (decision-log entry e48bac9 + the M1.2.3b pre-flight
// ratifications):
//   1. Single reaction round per top-level damage event. Reactions never cascade.
//   2. buff_remove fires when an active buff's durationTicks transitions 1 → 0
//      in the cleanup phase. -1 sentinel = full combat (never decremented).
//   3. Bloodmoon Plate's retaliation does NOT trigger Vampire Fang's on_hit on
//      the same side — reaction damage events are isReaction=true and skip the
//      reaction scan in damage_resolution.
//   4. TriggerState ownership: one per combatant, owned by the resolver, lazy
//      entry creation in the keyed verbs only.
//   5. Damage cap: amount = min(rawAmount, currentHp); remainingHp = max(0, hp
//      − rawAmount); HP floors at 0, never negative.
//   6. Adjacency = 4-directional edge adjacency (mirrors apps/client/src/run/
//      recipes.ts M0 BFS). Diagonals do not count.
//   7. on_adjacent_trigger fires REACTIVELY — every time a same-side adjacent
//      item with matching tags has a top-level trigger fire.
//   8. Buff de-dupe by (source ItemRef, target ItemRef, stat). First application
//      emits buff_apply and adds to the active list; same-tuple re-applications
//      are no-ops (no event, durationTicks unchanged). Different sources to the
//      same (target, stat) DO stack. Expired buffs CAN be re-applied.
//   9. cooldown_pct buff: applyPct(trigger.cooldownTicks, sumOfBuffAmounts) —
//      buff amount passes through directly (no negation). Mana Potion's −15 on
//      Iron Sword's 50-tick cooldown gives 42 effective ticks.
//  10. Public surface: simulateCombat(input, options?) with options.items
//      defaulting to ITEMS from @packbreaker/content. Surface deviation from
//      tech-architecture.md § 4.2 ratified for test ergonomics — fixtures inject
//      synthetic items via { ...ITEMS, ...customItems } merge.
//  11. Zero-amount events: damage events emit always (even at amount=0) but
//      suppress reactions when capped amount === 0. Heal events suppressed
//      entirely when actual gain === 0. Replay-log integrity asymmetry —
//      damage carries info even at 0 (proves a hit landed); zero-gain heals
//      don't.
//
// trigger_chance_pct buff: NO-OP in M1.2.3b. Schema-supported but no roll
// mechanism implemented yet — Rune Pedestal's chance buff is silently dropped.
// Defer to M1.2.5 fixture authoring.
//
// summon_temp_item effect: NO-OP in M1.2.3b. No M1 content uses it.

import {
  CLASSES,
  ITEMS,
  MAX_COMBAT_TICKS,
  RELICS,
  type BagPlacement,
  type BagState,
  type BuffableStat,
  type ClassId,
  type CombatEvent,
  type CombatInput,
  type CombatOutcome,
  type CombatResult,
  type Effect,
  type EntityRef,
  type Item,
  type ItemId,
  type ItemRef,
  type PlacementId,
  type RelicSlots,
  type TargetSelector,
  type Trigger,
} from '@packbreaker/content';
import { canonicalPlacements, canonicalCells, resolveTarget } from './iteration';
import { applyBp, applyPct } from './math';
import { createRng, type Rng } from './rng';
import {
  applyStatus,
  cleanupStatus,
  consumeStunIfPending,
  createStatusState,
  tickStatusDamage,
  type StatusState,
} from './status';
import {
  accumulateCooldown,
  createTriggerState,
  recordFire,
  shouldFire,
  type TriggerKey,
  type TriggerState,
  type TriggerType,
} from './triggers';

export interface SimulateCombatOptions {
  /** Optional items registry override. Defaults to ITEMS from @packbreaker/content.
   *  Test ergonomics escape hatch — fixtures inject synthetic items via
   *  { ...ITEMS, ...customItems } merge. Production callers should omit this. */
  readonly items?: Readonly<Record<ItemId, Item>>;
}

interface CombatantRuntime {
  hp: number;
  startingHp: number;
}

interface SideStats {
  bonusBaseDamage: number;
  lifestealPct: number;
  /** Locked answer 15 (M1.2.4 ratification): class.passive.recipeBonusPct
   *  plus summed RelicModifiers.recipeBonusPct. Applied multiplicatively to
   *  damage / heal / apply_status effects from placements listed in
   *  Combatant.recipeBornPlacementIds — BEFORE flat additions (buffs,
   *  bonusBaseDamage). Tinker's class passive (10) + Pocket Forge (15) +
   *  Catalyst (30) stacks to 55% recipe bonus per balance-bible.md § 12. */
  recipeBonusPct: number;
}

interface ActiveBuff {
  source: ItemRef;
  target: ItemRef;
  stat: BuffableStat;
  amount: number;
  durationTicks: number; // -1 = full combat
}

interface PendingDamage {
  source: ItemRef;
  sourceSide: EntityRef;
  targetSide: EntityRef;
  rawAmount: number;
  /** Reaction damage (from on_hit / on_taken_damage / on_adjacent_trigger
   *  effect chains) does NOT fire further reactions. Locked answer 1. */
  isReaction: boolean;
}

interface CombatState {
  tick: number;
  events: CombatEvent[];
  player: CombatantRuntime;
  ghost: CombatantRuntime;
  playerStatus: StatusState;
  ghostStatus: StatusState;
  playerTriggers: TriggerState;
  ghostTriggers: TriggerState;
  activeBuffs: ActiveBuff[];
  pendingDamage: PendingDamage[];
  rng: Rng;
  items: Readonly<Record<ItemId, Item>>;
  input: CombatInput;
  sideStats: { player: SideStats; ghost: SideStats };
  /** Precomputed 4-dir edge adjacency per placement. Bags are immutable for
   *  the duration of a combat, so adjacency is computed once at setup. */
  playerAdjacency: ReadonlyMap<PlacementId, ReadonlyArray<BagPlacement>>;
  ghostAdjacency: ReadonlyMap<PlacementId, ReadonlyArray<BagPlacement>>;
}

// ─── Public surface ──────────────────────────────────────────────────

export function simulateCombat(
  input: CombatInput,
  options?: SimulateCombatOptions,
): CombatResult {
  const items = options?.items ?? ITEMS;

  const player: CombatantRuntime = {
    hp: input.player.startingHp,
    startingHp: input.player.startingHp,
  };
  const ghost: CombatantRuntime = {
    hp: input.ghost.startingHp,
    startingHp: input.ghost.startingHp,
  };

  const state: CombatState = {
    tick: 0,
    events: [],
    player,
    ghost,
    playerStatus: createStatusState(),
    ghostStatus: createStatusState(),
    playerTriggers: createTriggerState(),
    ghostTriggers: createTriggerState(),
    activeBuffs: [],
    pendingDamage: [],
    rng: createRng(input.seed),
    items,
    input,
    sideStats: {
      player: deriveSideStats(input.player.classId, input.player.relics),
      ghost: deriveSideStats(input.ghost.classId, input.ghost.relics),
    },
    playerAdjacency: precomputeAdjacency(input.player.bag, items),
    ghostAdjacency: precomputeAdjacency(input.ghost.bag, items),
  };

  state.events.push({
    tick: 0,
    type: 'combat_start',
    playerHp: player.hp,
    ghostHp: ghost.hp,
  });

  for (state.tick = 0; state.tick < MAX_COMBAT_TICKS; state.tick++) {
    runTick(state);

    if (player.hp <= 0 || ghost.hp <= 0) {
      const outcome: CombatOutcome =
        player.hp <= 0 && ghost.hp <= 0
          ? 'draw'
          : player.hp <= 0
            ? 'ghost_win'
            : 'player_win';
      state.events.push({
        tick: state.tick,
        type: 'combat_end',
        outcome,
        finalHp: { player: player.hp, ghost: ghost.hp },
      });
      return {
        events: state.events,
        outcome,
        finalHp: { player: player.hp, ghost: ghost.hp },
        endedAtTick: state.tick,
      };
    }
  }

  // Tick cap reached without a death. Draw at MAX_COMBAT_TICKS (synthetic tick).
  state.events.push({
    tick: MAX_COMBAT_TICKS,
    type: 'combat_end',
    outcome: 'draw',
    finalHp: { player: player.hp, ghost: ghost.hp },
  });
  return {
    events: state.events,
    outcome: 'draw',
    finalHp: { player: player.hp, ghost: ghost.hp },
    endedAtTick: MAX_COMBAT_TICKS,
  };
}

// ─── Tick loop ───────────────────────────────────────────────────────

function runTick(state: CombatState): void {
  // round_start (tick 0 only)
  if (state.tick === 0) {
    runTriggerPhase(state, 'on_round_start');
  }

  // cooldowns: accumulate then iterate
  accumulateCooldown(state.playerTriggers, 1);
  accumulateCooldown(state.ghostTriggers, 1);
  runCooldownPhase(state);

  // damage_resolution
  runDamageResolution(state);

  // status_ticks (player first, then ghost; non-reactive)
  runStatusTicksPhase(state);

  // low_health
  runTriggerPhase(state, 'on_low_health');

  // cleanup
  cleanupStatus(state.playerStatus, state.tick);
  cleanupStatus(state.ghostStatus, state.tick);
  decrementBuffs(state);
  // Death check happens in the caller (simulateCombat's main loop).
}

// ─── Phase: on_round_start / on_low_health (top-level, non-cooldown) ──

function runTriggerPhase(state: CombatState, type: 'on_round_start' | 'on_low_health'): void {
  for (const side of ['player', 'ghost'] as const) {
    const bag = side === 'player' ? state.input.player.bag : state.input.ghost.bag;
    for (const placement of canonicalPlacements(bag)) {
      // canonicalCells in precomputeAdjacency setup throws on unknown itemId,
      // so reaching here implies items[placement.itemId] is defined.
      const item = state.items[placement.itemId]!;
      for (let i = 0; i < item.triggers.length; i++) {
        const trigger = item.triggers[i]!;
        if (trigger.type !== type) continue;

        if (type === 'on_low_health') {
          // Locked answer: floor((hp * 100) / startingHp) < thresholdPct
          // (strict less-than). Once-per-combat enforced by lowHealthFired in
          // TriggerState; threshold check is the gate, lowHealthFired is the
          // memoization.
          const combatant = side === 'player' ? state.player : state.ghost;
          const hpPct = Math.floor((combatant.hp * 100) / combatant.startingHp);
          if (hpPct >= (trigger as Extract<Trigger, { type: 'on_low_health' }>).thresholdPct) continue;
        }

        const triggerState = side === 'player' ? state.playerTriggers : state.ghostTriggers;
        const key: TriggerKey = { placementId: placement.placementId, triggerIndex: i };
        if (!shouldFire(triggerState, key, trigger.type, undefined, trigger.maxTriggersPerCombat)) continue;

        fireTrigger(state, side, placement, trigger, i, true);
      }
    }
  }
}

// ─── Phase: cooldowns ────────────────────────────────────────────────

function runCooldownPhase(state: CombatState): void {
  for (const side of ['player', 'ghost'] as const) {
    const bag = side === 'player' ? state.input.player.bag : state.input.ghost.bag;
    const triggerState = side === 'player' ? state.playerTriggers : state.ghostTriggers;
    const status = side === 'player' ? state.playerStatus : state.ghostStatus;

    for (const placement of canonicalPlacements(bag)) {
      // canonicalCells in precomputeAdjacency setup throws on unknown itemId.
      const item = state.items[placement.itemId]!;
      for (let i = 0; i < item.triggers.length; i++) {
        const trigger = item.triggers[i]!;
        if (trigger.type !== 'on_cooldown') continue;

        // Effective cooldown after cooldown_pct buffs (locked answer 9).
        const sourceItemRef: ItemRef = { side, placementId: placement.placementId };
        const cdBuffSum = sumActiveBuffs(state.activeBuffs, sourceItemRef, 'cooldown_pct');
        const baseCd = trigger.cooldownTicks;
        const effectiveCd = cdBuffSum === 0 ? baseCd : applyPct(baseCd, cdBuffSum);
        const key: TriggerKey = { placementId: placement.placementId, triggerIndex: i };

        if (!shouldFire(triggerState, key, 'on_cooldown', effectiveCd, trigger.maxTriggersPerCombat)) continue;

        // Stun consumption — locked answer (M1.2.2 ratification): consumeStunIfPending
        // skips effects without recordFire, so the cooldown accumulator KEEPS
        // accumulating (next tick the trigger is still eligible until it actually
        // fires).
        if (consumeStunIfPending(status)) {
          state.events.push({
            tick: state.tick,
            type: 'stun_consumed',
            source: sourceItemRef,
            target: side,
          });
          continue;
        }

        fireTrigger(state, side, placement, trigger, i, true);
      }
    }
  }
}

// ─── Phase: damage_resolution ───────────────────────────────────────

function runDamageResolution(state: CombatState): void {
  // Drain top-level damage events queued during round_start / cooldowns
  // phases, in canonical order (chronological by emission). Reactions fired
  // here apply INLINE — applyDamage is called directly during fireTrigger →
  // resolveEffect, NOT re-queued. This keeps reaction damage events in events[]
  // immediately after their causing top-level event, matching the spec's
  // "chronological by emission" definition.
  while (state.pendingDamage.length > 0) {
    const pd = state.pendingDamage.shift()!;
    applyDamage(state, pd);
  }
}

/** Applies a damage event: HP mutation, event emission, lifesteal, reactions.
 *  Called during damage_resolution drain (for top-level events) and inline
 *  during reaction effect resolution (for reaction events flagged
 *  isReaction=true). The latter case bypasses pendingDamage entirely so the
 *  reaction's damage event lands in events[] immediately after the parent. */
function applyDamage(state: CombatState, pd: PendingDamage): void {
  const target = pd.targetSide === 'player' ? state.player : state.ghost;
  const sourceCombatant = pd.sourceSide === 'player' ? state.player : state.ghost;
  const sourceSideStats = state.sideStats[pd.sourceSide];

  // Locked answer 5: amount = min(rawAmount, currentHp). HP floors at 0.
  const cappedAmount = Math.max(0, Math.min(pd.rawAmount, target.hp));
  target.hp = Math.max(0, target.hp - pd.rawAmount);

  state.events.push({
    tick: state.tick,
    type: 'damage',
    source: pd.source,
    target: pd.targetSide,
    amount: cappedAmount,
    remainingHp: target.hp,
  });

  // Locked answer 11: zero-damage events emit but suppress reactions and
  // lifesteal. Replay-log integrity (the hit happened) without zero-amount
  // reaction noise.
  if (cappedAmount === 0) return;

  // Lifesteal: source-side's relic-summed lifestealPct of capped amount.
  // Applies to all damage events (top-level and reaction) symmetrically —
  // Bloodmoon Plate's retaliation lifesteals back if its owner has lifestealPct.
  if (sourceSideStats.lifestealPct > 0) {
    const healAmount = applyBp(cappedAmount, sourceSideStats.lifestealPct * 100);
    const beforeHp = sourceCombatant.hp;
    const newHp = Math.min(sourceCombatant.startingHp, beforeHp + healAmount);
    const actualGain = newHp - beforeHp;
    if (actualGain > 0) {
      sourceCombatant.hp = newHp;
      state.events.push({
        tick: state.tick,
        type: 'heal',
        source: pd.source,
        target: pd.sourceSide,
        amount: actualGain,
        newHp,
      });
    }
  }

  // Locked answer 1+3: reaction damage events do NOT fire reactions
  // (Bloodmoon Plate's retaliation does not trigger Vampire Fang).
  if (pd.isReaction) return;

  // Top-level damage event → fire on_hit on source side, on_taken_damage on
  // target side. Single round each, canonical placement order. Reactions'
  // damage effects flow back through resolveEffect with isReaction=true,
  // which routes to applyDamage inline (not queued).
  fireDamageReactions(state, pd.sourceSide, 'on_hit', pd.source);
  fireDamageReactions(state, pd.targetSide, 'on_taken_damage', pd.source);
}

function fireDamageReactions(
  state: CombatState,
  side: EntityRef,
  type: 'on_hit' | 'on_taken_damage',
  _causingSource: ItemRef,
): void {
  const bag = side === 'player' ? state.input.player.bag : state.input.ghost.bag;
  const triggerState = side === 'player' ? state.playerTriggers : state.ghostTriggers;

  for (const placement of canonicalPlacements(bag)) {
    // canonicalCells in precomputeAdjacency setup throws on unknown itemId.
    const item = state.items[placement.itemId]!;
    for (let i = 0; i < item.triggers.length; i++) {
      const trigger = item.triggers[i]!;
      if (trigger.type !== type) continue;
      const key: TriggerKey = { placementId: placement.placementId, triggerIndex: i };
      if (!shouldFire(triggerState, key, type, undefined, trigger.maxTriggersPerCombat)) continue;

      // isTopLevel=false — reactions don't trigger on_adjacent_trigger fires.
      // Their effects' damage events are flagged isReaction=true.
      fireTrigger(state, side, placement, trigger, i, false);
    }
  }
}

// ─── Phase: status_ticks ────────────────────────────────────────────

function runStatusTicksPhase(state: CombatState): void {
  // Player side first, then ghost side. Status tick damage is non-reactive —
  // does not fire on_hit (no source) or on_taken_damage (locked: bible § 4
  // burn-bypass extended to all status ticks).
  for (const side of ['player', 'ghost'] as const) {
    const status = side === 'player' ? state.playerStatus : state.ghostStatus;
    const combatant = side === 'player' ? state.player : state.ghost;
    const { burnDamage, poisonDamage } = tickStatusDamage(status, state.tick);

    if (burnDamage > 0) {
      combatant.hp = Math.max(0, combatant.hp - burnDamage);
      state.events.push({
        tick: state.tick,
        type: 'status_tick',
        target: side,
        status: 'burn',
        damage: burnDamage,
        remainingHp: combatant.hp,
      });
    }
    if (poisonDamage > 0) {
      combatant.hp = Math.max(0, combatant.hp - poisonDamage);
      state.events.push({
        tick: state.tick,
        type: 'status_tick',
        target: side,
        status: 'poison',
        damage: poisonDamage,
        remainingHp: combatant.hp,
      });
    }
  }
}

// ─── Phase: cleanup (buff decay) ────────────────────────────────────

function decrementBuffs(state: CombatState): void {
  // Walk in reverse so splice doesn't shift unprocessed indices. Buffs with
  // durationTicks=-1 (full combat) are skipped — locked answer 2.
  for (let i = state.activeBuffs.length - 1; i >= 0; i--) {
    const buff = state.activeBuffs[i]!;
    if (buff.durationTicks === -1) continue;
    buff.durationTicks -= 1;
    if (buff.durationTicks === 0) {
      state.events.push({
        tick: state.tick,
        type: 'buff_remove',
        target: buff.target,
        stat: buff.stat,
        amount: buff.amount,
      });
      state.activeBuffs.splice(i, 1);
    }
  }
}

// ─── Trigger firing (top-level OR reaction) ─────────────────────────

function fireTrigger(
  state: CombatState,
  side: EntityRef,
  placement: BagPlacement,
  trigger: Trigger,
  triggerIndex: number,
  isTopLevel: boolean,
): void {
  const sourceItemRef: ItemRef = { side, placementId: placement.placementId };

  state.events.push({
    tick: state.tick,
    type: 'item_trigger',
    source: sourceItemRef,
    trigger: trigger.type,
  });

  // Locked answer 7: on_adjacent_trigger fires reactively, BEFORE the
  // originating trigger's effects. This way Whetstone's damage buff applies in
  // time for the originating Iron Sword's damage event to be queued at base+1
  // on the very first fire (rather than only from the second fire onward).
  // Only top-level fires produce adjacent reactions — locked answer 1 (no
  // cascade): reactions can't trigger reactions.
  if (isTopLevel) {
    fireAdjacentReactions(state, side, placement);
  }

  for (const effect of trigger.effects) {
    resolveEffect(state, effect, sourceItemRef, side, !isTopLevel);
  }

  const triggerState = side === 'player' ? state.playerTriggers : state.ghostTriggers;
  recordFire(
    triggerState,
    { placementId: placement.placementId, triggerIndex },
    trigger.type as TriggerType,
  );
}

function fireAdjacentReactions(
  state: CombatState,
  side: EntityRef,
  sourcePlacement: BagPlacement,
): void {
  // canonicalCells in precomputeAdjacency setup throws on unknown itemId, so
  // reaching here implies items[*.itemId] is defined for every placement.
  const sourceItem = state.items[sourcePlacement.itemId]!;
  const adjacencyMap = side === 'player' ? state.playerAdjacency : state.ghostAdjacency;
  const adjacents = adjacencyMap.get(sourcePlacement.placementId)!;
  const triggerState = side === 'player' ? state.playerTriggers : state.ghostTriggers;

  // Adjacents are already in canonical order from precomputeAdjacency.
  for (const adj of adjacents) {
    const adjItem = state.items[adj.itemId]!;
    for (let i = 0; i < adjItem.triggers.length; i++) {
      const t = adjItem.triggers[i]!;
      if (t.type !== 'on_adjacent_trigger') continue;
      // Filter by matchTags: source item's tags must match at least one.
      // Empty/omitted matchTags = match all (consistent with buff_adjacent).
      if (t.matchTags && t.matchTags.length > 0) {
        const matched = t.matchTags.some((tag) => sourceItem.tags.includes(tag));
        if (!matched) continue;
      }
      const key: TriggerKey = { placementId: adj.placementId, triggerIndex: i };
      if (!shouldFire(triggerState, key, 'on_adjacent_trigger', undefined, t.maxTriggersPerCombat)) continue;
      // Reaction fire — isTopLevel=false. Its effects' damage events become
      // isReaction=true; no further on_adjacent_trigger cascade.
      fireTrigger(state, side, adj, t, i, false);
    }
  }
}

// ─── Effect resolver ────────────────────────────────────────────────

function resolveEffect(
  state: CombatState,
  effect: Effect,
  source: ItemRef,
  sourceSide: EntityRef,
  isReaction: boolean,
): void {
  switch (effect.type) {
    case 'damage': {
      const targetSide = resolveTargetSideForDamage(state, effect.target, sourceSide);
      if (targetSide === null) return;
      const buffSum = sumActiveBuffs(state.activeBuffs, source, 'damage');
      // Locked answer 15: recipeBonusPct applies multiplicatively to recipe-born
      // sources BEFORE flat additions (buffs, bonusBaseDamage).
      const baseAmount = isRecipeBornSource(state, source)
        ? applyPct(effect.amount, state.sideStats[sourceSide].recipeBonusPct)
        : effect.amount;
      const finalAmount = baseAmount + buffSum + state.sideStats[sourceSide].bonusBaseDamage;
      const pd: PendingDamage = {
        source,
        sourceSide,
        targetSide,
        rawAmount: finalAmount,
        isReaction,
      };
      if (isReaction) {
        // Apply inline so reaction damage events emit in events[] immediately
        // after the parent top-level damage event (locked answer: chronological
        // by emission). Bypasses pendingDamage entirely.
        applyDamage(state, pd);
      } else {
        // Top-level damage event from cooldowns / round_start / low_health.
        // Goes into pendingDamage for damage_resolution drain.
        state.pendingDamage.push(pd);
      }
      return;
    }

    case 'heal': {
      const targetSide = resolveTargetSideForDamage(state, effect.target, sourceSide);
      if (targetSide === null) return;
      const target = targetSide === 'player' ? state.player : state.ghost;
      // Locked answer 15: recipeBonusPct applies before the heal cap.
      const healAmount = isRecipeBornSource(state, source)
        ? applyPct(effect.amount, state.sideStats[sourceSide].recipeBonusPct)
        : effect.amount;
      const beforeHp = target.hp;
      const newHp = Math.min(target.startingHp, beforeHp + healAmount);
      const actualGain = newHp - beforeHp;
      // Locked answer 11: suppress zero-gain heals entirely.
      if (actualGain <= 0) return;
      target.hp = newHp;
      state.events.push({
        tick: state.tick,
        type: 'heal',
        source,
        target: targetSide,
        amount: actualGain,
        newHp,
      });
      return;
    }

    case 'apply_status': {
      const targetSide = resolveTargetSideForDamage(state, effect.target, sourceSide);
      if (targetSide === null) return;
      const targetStatus = targetSide === 'player' ? state.playerStatus : state.ghostStatus;
      // Locked answer 15: recipeBonusPct applies to status stacks BEFORE the
      // silent cap from STATUS_STACK_CAPS. Stun (boolean) ignores stacks per
      // status.ts semantics, so the bonus is a no-op there but harmless to
      // compute.
      const stacks = isRecipeBornSource(state, source)
        ? applyPct(effect.stacks, state.sideStats[sourceSide].recipeBonusPct)
        : effect.stacks;
      applyStatus(targetStatus, effect.status, stacks);
      // Locked (M1.2.2): event reflects POST-recipe-bonus, PRE-cap stacks per
      // silent-cap ratification. status_apply emits what the resolver tried to
      // apply, regardless of how much the cap silently absorbed.
      state.events.push({
        tick: state.tick,
        type: 'status_apply',
        source,
        target: targetSide,
        status: effect.status,
        stacks,
      });
      return;
    }

    case 'add_gold':
      // Out-of-combat. Run controller (M1.2.4) handles gold credits.
      return;

    case 'buff_adjacent': {
      const adjacencyMap = sourceSide === 'player' ? state.playerAdjacency : state.ghostAdjacency;
      const adjacents = adjacencyMap.get(source.placementId)!;
      for (const adj of adjacents) {
        const adjItem = state.items[adj.itemId]!;
        if (effect.matchTags && effect.matchTags.length > 0) {
          const matched = effect.matchTags.some((tag) => adjItem.tags.includes(tag));
          if (!matched) continue;
        }
        // trigger_chance_pct: NO-OP in M1.2.3b. Schema-supported but no roll
        // mechanism implemented. Defer to M1.2.5. Skipping the entire buff
        // (no list mutation, no event) — Rune Pedestal's buffs are silently
        // dropped from the replay log until M1.2.5.
        if (effect.stat === 'trigger_chance_pct') continue;

        const targetRef: ItemRef = { side: sourceSide, placementId: adj.placementId };
        // Locked answer 8: de-dupe by (source, target, stat). Same-tuple
        // re-application is a no-op — no event, no list mutation, durationTicks
        // NOT refreshed. Different sources to same (target, stat) DO stack.
        const exists = state.activeBuffs.some(
          (b) =>
            b.source.side === source.side &&
            b.source.placementId === source.placementId &&
            b.target.side === targetRef.side &&
            b.target.placementId === targetRef.placementId &&
            b.stat === effect.stat,
        );
        if (exists) continue;

        const durationTicks = effect.durationTicks ?? -1;
        state.activeBuffs.push({
          source,
          target: targetRef,
          stat: effect.stat,
          amount: effect.amount,
          durationTicks,
        });
        state.events.push({
          tick: state.tick,
          type: 'buff_apply',
          source,
          target: targetRef,
          stat: effect.stat,
          amount: effect.amount,
        });
      }
      return;
    }

    case 'summon_temp_item':
      // NO-OP in M1.2.3b. No M1 content uses summon_temp_item; defer to a
      // future content lever. No event emitted.
      return;
  }
}

/** Resolves an Effect's TargetSelector to a side EntityRef. random_item
 *  selectors flow through resolveTarget (which consumes one rng.next() at the
 *  moment of effect application, returns null on empty bag). For damage / heal
 *  / apply_status effects we collapse the random ItemRef result down to its
 *  side, since per-item HP / status doesn't exist in the M1 sim.
 *
 *  Returns null when resolveTarget returns null (empty bag) — caller short-
 *  circuits with no event and no rng cost beyond the one already consumed by
 *  resolveTarget. */
function resolveTargetSideForDamage(
  state: CombatState,
  selector: TargetSelector,
  sourceSide: EntityRef,
): EntityRef | null {
  const result = resolveTarget(
    selector,
    sourceSide,
    state.input.player.bag,
    state.input.ghost.bag,
    state.rng,
  );
  if (result === null) return null;
  if (typeof result === 'string') return result; // EntityRef
  return result.side; // ItemRef → its side
}

// ─── Setup helpers ──────────────────────────────────────────────────

function deriveSideStats(classId: ClassId, relics: RelicSlots): SideStats {
  const cls = CLASSES[classId];
  let bonusBaseDamage = cls?.passive.bonusBaseDamage ?? 0;
  let lifestealPct = 0;
  let recipeBonusPct = cls?.passive.recipeBonusPct ?? 0;

  for (const slot of [relics.starter, relics.mid, relics.boss]) {
    if (slot === null) continue;
    const relic = RELICS[slot];
    if (!relic) continue;
    bonusBaseDamage += relic.modifiers.bonusBaseDamage ?? 0;
    lifestealPct += relic.modifiers.lifestealPct ?? 0;
    recipeBonusPct += relic.modifiers.recipeBonusPct ?? 0;
  }

  return { bonusBaseDamage, lifestealPct, recipeBonusPct };
}

function precomputeAdjacency(
  bag: BagState,
  items: Readonly<Record<ItemId, Item>>,
): ReadonlyMap<PlacementId, ReadonlyArray<BagPlacement>> {
  const map = new Map<PlacementId, ReadonlyArray<BagPlacement>>();
  const placements = canonicalPlacements(bag);
  for (const p of placements) {
    map.set(p.placementId, computeAdjacents(p, placements, items));
  }
  return map;
}

/** 4-directional edge adjacency. Returns adjacent placements in canonical
 *  order. Locked answer 6 — mirrors apps/client/src/run/recipes.ts. */
function computeAdjacents(
  source: BagPlacement,
  allPlacements: ReadonlyArray<BagPlacement>,
  items: Readonly<Record<ItemId, Item>>,
): ReadonlyArray<BagPlacement> {
  // canonicalCells throws on unknown itemId — that's the canonical error path
  // for malformed input. No defensive items[itemId] check here.
  const sourceCells = canonicalCells(source, items);
  const sourceKeys = new Set(sourceCells.map((c) => `${c.row}:${c.col}`));

  const out: BagPlacement[] = [];
  for (const other of allPlacements) {
    if (other.placementId === source.placementId) continue;
    const otherCells = canonicalCells(other, items);
    let adj = false;
    for (const oc of otherCells) {
      if (
        sourceKeys.has(`${oc.row - 1}:${oc.col}`) ||
        sourceKeys.has(`${oc.row + 1}:${oc.col}`) ||
        sourceKeys.has(`${oc.row}:${oc.col - 1}`) ||
        sourceKeys.has(`${oc.row}:${oc.col + 1}`)
      ) {
        adj = true;
        break;
      }
    }
    if (adj) out.push(other);
  }
  return out;
}

/** Locked answer 15: returns true if `source.placementId` is in the source
 *  side's `recipeBornPlacementIds` (set by the run controller after a
 *  combineRecipe call). Returns false otherwise — including when the field is
 *  undefined (omitted by all M1.2.3b fixtures). */
function isRecipeBornSource(state: CombatState, source: ItemRef): boolean {
  const ids = source.side === 'player'
    ? state.input.player.recipeBornPlacementIds
    : state.input.ghost.recipeBornPlacementIds;
  if (!ids) return false;
  for (const id of ids) {
    if (id === source.placementId) return true;
  }
  return false;
}

function sumActiveBuffs(
  buffs: ReadonlyArray<ActiveBuff>,
  target: ItemRef,
  stat: BuffableStat,
): number {
  let sum = 0;
  for (const b of buffs) {
    if (
      b.target.side === target.side &&
      b.target.placementId === target.placementId &&
      b.stat === stat
    ) {
      sum += b.amount;
    }
  }
  return sum;
}
