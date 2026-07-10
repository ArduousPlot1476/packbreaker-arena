// CF 57 — structural item-description derivation.
//
// Items (unlike Relics, content-schemas.ts § 6) carry NO authored `description`
// field. Per the Option-B decision this session, human-readable item text is
// DERIVED structurally from each Item's `triggers` / `effects` / `passiveStats`
// at render time — no hand-authored copy, every string traces to a field value.
//
// Register: TERSE / arcade (CF 57 Q2). One line per describable trigger, then
// one line per present passiveStats field.
//
// Two effects the shipped game does NOT execute are OMITTED (CF 57 Q1 — "show
// only what the sim actually does"):
//   • buff_adjacent { stat: 'trigger_chance_pct' } — hard no-op (combat.ts:699,
//     deferred to M1.2.5).
//   • summon_temp_item — no-op (combat.ts:735) and used by zero shipped items.
// Their switch cases remain (returning null) so a future Trigger/Effect schema
// member still fails to compile here rather than silently rendering nothing.
// `add_gold` is now REAL: the run controller credits it out-of-combat at
// round-end (CF 59, computeItemGoldIncome in state.ts), so it renders.
//
// PassiveStats: `maxHpBonus` (state.ts sums it into Combatant.startingHp) and
// `goldPerRound` (CF 59 — credited per round-end by the run controller) are
// rendered. `bonusBaseDamage` (reserved for M2, used by no shipped item) is
// still omitted — see describePassiveStats.
//
// Sign hazard: buff_adjacent `cooldown_pct` is applied un-negated as
// floor(base*(100+pct)/100) (math.ts:18) — a POSITIVE amount lengthens the
// cooldown (slower/worse); NEGATIVE shortens it (faster/better). All shipped
// items author negative amounts. Wording is sign-aware; tested at both signs.
//
// Input is the CANONICAL content Item — the client's ItemDef (run/content.ts
// adaptItem) strips triggers/passiveStats, so callers resolve getItem(id) first.

import type {
  BuffableStat,
  Effect,
  Item,
  PassiveStats,
  TargetSelector,
  Trigger,
} from '@packbreaker/content';
import { TICKS_PER_SECOND } from '@packbreaker/content';

/** Compile-time exhaustiveness guard: a new union member makes this fail to
 *  compile at the call site, so no variant can silently render nothing. */
function assertNever(value: never): never {
  throw new Error(`describeItem: unhandled variant ${JSON.stringify(value)}`);
}

/** Ticks → seconds via the canonical constant (never hardcode /10). Strips a
 *  trailing `.0` so whole seconds read "5s", not "5.0s". */
function formatSeconds(ticks: number): string {
  const seconds = ticks / TICKS_PER_SECOND;
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}

function titleCase(tag: string): string {
  return tag.length === 0 ? tag : tag.charAt(0).toUpperCase() + tag.slice(1);
}

function targetWord(target: TargetSelector): string {
  switch (target) {
    case 'self':
      return 'you';
    case 'opponent':
      return 'enemy';
    case 'self_random_item':
      return 'a random item of yours';
    case 'opp_random_item':
      return 'a random enemy item';
    default:
      return assertNever(target);
  }
}

function describeBuffAdjacent(
  effect: Extract<Effect, { type: 'buff_adjacent' }>,
): string | null {
  const tagPart =
    effect.matchTags && effect.matchTags.length > 0
      ? `${effect.matchTags.join('/')} `
      : '';
  let line: string | null;
  const stat: BuffableStat = effect.stat;
  switch (stat) {
    case 'damage':
      line = `nearby ${tagPart}items +${effect.amount} dmg`;
      break;
    case 'cooldown_pct': {
      if (effect.amount === 0) {
        line = null;
        break;
      }
      // Sign-aware: negative = faster (all shipped items), positive = slower.
      const pct = Math.abs(effect.amount);
      const dir = effect.amount < 0 ? 'faster' : 'slower';
      line = `nearby ${tagPart}items fire ${pct}% ${dir}`;
      break;
    }
    case 'trigger_chance_pct':
      // Sim no-op (combat.ts:699, deferred to M1.2.5) — omit (CF 57 Q1).
      line = null;
      break;
    default:
      return assertNever(stat);
  }
  if (line != null && effect.durationTicks != null) {
    line = `${line} for ${formatSeconds(effect.durationTicks)}s`;
  }
  return line;
}

/** One effect → one terse clause, or null when the sim does not execute it. */
export function describeEffect(effect: Effect): string | null {
  switch (effect.type) {
    case 'damage':
      return `${effect.amount} dmg to ${targetWord(effect.target)}`;
    case 'heal':
      return effect.target === 'self'
        ? `heal ${effect.amount}`
        : `heal ${targetWord(effect.target)} ${effect.amount}`;
    case 'apply_status': {
      const base =
        effect.status === 'stun'
          ? `stun ${targetWord(effect.target)}`
          : `${effect.status} ${effect.stacks} to ${targetWord(effect.target)}`;
      return effect.durationTicks != null
        ? `${base} for ${formatSeconds(effect.durationTicks)}s`
        : base;
    }
    case 'add_gold':
      // Real as of CF 59: the sim skips it in combat (combat.ts:682, by
      // design — out-of-combat only), but the run controller credits it at
      // round-end (computeItemGoldIncome, state.ts). describeTrigger prefixes
      // the trigger condition (e.g. "Round start — ").
      return `+${effect.amount} gold`;
    case 'buff_adjacent':
      return describeBuffAdjacent(effect);
    case 'summon_temp_item':
      // Sim no-op (combat.ts:735) + zero shipped items use it — omit (CF 57 Q1).
      return null;
    default:
      return assertNever(effect);
  }
}

function triggerCondition(trigger: Trigger): string {
  switch (trigger.type) {
    case 'on_round_start':
      return 'Round start';
    case 'on_cooldown':
      return `Every ${formatSeconds(trigger.cooldownTicks)}s`;
    case 'on_hit':
      return 'On hit';
    case 'on_taken_damage':
      return 'When you take damage';
    case 'on_adjacent_trigger':
      return trigger.matchTags && trigger.matchTags.length > 0
        ? `When an adjacent ${trigger.matchTags.join('/')} triggers`
        : 'When an adjacent item triggers';
    case 'on_low_health':
      return `Below ${trigger.thresholdPct}% HP`;
    default:
      return assertNever(trigger);
  }
}

function triggerCap(max: number | undefined): string {
  if (max == null) return '';
  return max === 1 ? ' (once)' : ` (up to ${max}×)`;
}

/** One trigger → one terse line, or null when every one of its effects is
 *  omitted (so no dangling "condition — " with nothing after it). */
export function describeTrigger(trigger: Trigger): string | null {
  const effects = trigger.effects
    .map(describeEffect)
    .filter((line): line is string => line != null);
  if (effects.length === 0) return null;
  return `${triggerCondition(trigger)} — ${effects.join(', ')}${triggerCap(
    trigger.maxTriggersPerCombat,
  )}`;
}

/** Passive modifiers → one line each. `maxHpBonus` (state.ts sums it into
 *  Combatant.startingHp) and `goldPerRound` (CF 59 — the run controller credits
 *  it per round-end via computeItemGoldIncome) are both rendered.
 *  `bonusBaseDamage` is reserved for M2 (used by no shipped item), so it is
 *  omitted rather than advertising damage the game never grants (CF 57 Q1). */
export function describePassiveStats(stats: PassiveStats): string[] {
  const lines: string[] = [];
  if (stats.maxHpBonus != null) lines.push(`+${stats.maxHpBonus} max HP`);
  if (stats.goldPerRound != null) lines.push(`+${stats.goldPerRound} gold per round`);
  return lines;
}

/** Full derived description for an item: trigger lines then passive lines.
 *  Never empty — falls back to a structural tag summary for an item whose only
 *  content is sim-inert and which has no passives (Rune Pedestal is the sole
 *  such shipped item; CF 57 Q1 = omit, so it must not re-describe the buff). */
export function describeItem(item: Item): string[] {
  const lines: string[] = [];
  for (const trigger of item.triggers) {
    const line = describeTrigger(trigger);
    if (line != null) lines.push(line);
  }
  if (item.passiveStats) lines.push(...describePassiveStats(item.passiveStats));
  if (lines.length === 0) {
    const tagLine = item.tags.map(titleCase).join(' · ');
    lines.push(tagLine.length > 0 ? tagLine : item.name);
  }
  return lines;
}
