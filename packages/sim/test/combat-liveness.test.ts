// combat-liveness.test.ts — CF-94 CP4 asymmetric liveness gate.
// decision-log.md 2026-07-25 § "CF-94 CUT POINT PLACED at CP4 (Route D Phase 1
// RATIFIED; docs-only, insertion-only): the predicate is CROSS-SIDE, not
// effect-type …".
//
// PREDICATE UNDER TEST: an effect originated by a combatant whose CURRENT HP is
// <= 0 resolves only if it does NOT cross to the opponent. Self-side effects
// (heal-self, buff_adjacent) resolve unchanged at either liveness.
//
// Every test here is Rule 28-falsifiable by construction: each names, in its own
// comment, the specific wrong implementation it goes RED under. The three
// negations exercised are (i) NO GUARD, (ii) an ENQUEUE-time guard, and
// (iii) an OVER-firing guard that suppresses self-side effects too (Route C).

import { describe, expect, it } from 'vitest';
import {
  ClassId,
  ItemId,
  PlacementId,
  RelicId,
  DEFAULT_RULESET,
  type BagPlacement,
  type BagState,
  type CombatInput,
  type Combatant,
  type RelicSlots,
} from '@packbreaker/content';
import { simulateCombat } from '../src/combat';

const TINKER = ClassId('tinker');
const MARAUDER = ClassId('marauder');
const NO_RELICS: RelicSlots = { starter: null, mid: null, boss: null };

// bloodfont (starter, lifestealPct 20) + crimson-pact (mid, lifestealPct 35)
// = 55%, both Marauder and in different slots so they stack. Chosen so the
// suppressed retaliation would lifesteal a NON-ZERO amount if it landed —
// floor(4 * 0.55) = 2 — which is what makes the resurrection observable.
const LIFESTEAL_RELICS: RelicSlots = {
  starter: RelicId('bloodfont'),
  mid: RelicId('crimson-pact'),
  boss: null,
};

function placement(slug: string, idStr: string, col = 0, row = 0): BagPlacement {
  return { placementId: PlacementId(idStr), itemId: ItemId(slug), anchor: { col, row }, rotation: 0 };
}
function bag(...placements: BagPlacement[]): BagState {
  return { dimensions: DEFAULT_RULESET.bagDimensions, placements };
}
function combatant(
  bagState: BagState,
  startingHp: number,
  classId = TINKER,
  relics: RelicSlots = NO_RELICS,
): Combatant {
  return { bag: bagState, relics, classId, startingHp };
}
function input(player: Combatant, ghost: Combatant): CombatInput {
  return { seed: 1 as CombatInput['seed'], player, ghost };
}

// iron-sword: on_cooldown 50 ticks, damage 4 (packages/content/src/items.ts:66).
// A Tinker player adds no bonusBaseDamage, so the hit is exactly 4 — sized to
// take a 4-HP ghost to exactly 0 on the tick-50 fire.
const ONE_SHOT_TICK = 50;

// ─── S1 + S2a — retaliation and lifesteal from a 0-HP source ────────

describe('CF-94 CP4 — a 0-HP combatant cannot act on the opponent', () => {
  // Ghost dies to the tick-50 iron-sword hit, then its bloodmoon-plate
  // on_taken_damage retaliation (damage 3 + Marauder passive 1 = 4) fires from
  // 0 HP. Unguarded, that retaliation both damages the player AND lifesteals
  // floor(4 * 0.55) = 2 back into the dead ghost, resurrecting it to 2.
  const retaliation = () =>
    simulateCombat(
      input(
        combatant(bag(placement('iron-sword', 'p1')), 30),
        combatant(bag(placement('bloodmoon-plate', 'g1')), 4, MARAUDER, LIFESTEAL_RELICS),
      ),
    );

  it('S1 — does not lifesteal off its own suppressed retaliation (no resurrection)', () => {
    // RED under NO GUARD: the ghost lifesteals to 2 HP, survives the tick-50
    // death check, and the combat runs on past tick 50.
    const r = retaliation();
    expect(r.finalHp.ghost).toBe(0);
    expect(r.endedAtTick).toBe(ONE_SHOT_TICK);
    expect(r.outcome).toBe('player_win');
    const ghostHealed = r.events.some((e) => e.type === 'heal' && e.target === 'ghost');
    expect(ghostHealed).toBe(false);
  });

  it('S2a — its on_taken_damage retaliation does not reach the opponent', () => {
    // RED under NO GUARD: a damage event targeting the player exists and
    // finalHp.player is 26, not 30.
    const r = retaliation();
    expect(r.finalHp.player).toBe(30);
    const playerTookDamage = r.events.some((e) => e.type === 'damage' && e.target === 'player');
    expect(playerTookDamage).toBe(false);
  });
});

// ─── S3 — the enqueue-vs-drain hazard ───────────────────────────────

describe('CF-94 CP4 — liveness is evaluated at APPLICATION, not at enqueue', () => {
  it('S3 — a combatant killed mid-drain does not land its already-queued damage', () => {
    // Both sides carry iron-sword (cd 50), so BOTH queue a damage event during
    // the tick-50 cooldown phase, while both are still alive. The drain applies
    // the player's first (canonical side order, player before ghost), taking the
    // 4-HP ghost to 0; the ghost's already-queued hit then drains from a 0-HP
    // source and must be suppressed.
    //
    // ⚠ THIS IS THE TEST THAT DISTINGUISHES APPLICATION-TIME FROM ENQUEUE-TIME.
    // RED under NO GUARD and RED under an ENQUEUE-TIME guard alike — both let the
    // ghost's queued hit through, leaving finalHp.player at 26. An enqueue check
    // can never fire here, because neither side is dead when the queue is built.
    const r = simulateCombat(
      input(
        combatant(bag(placement('iron-sword', 'p1')), 30),
        combatant(bag(placement('iron-sword', 'g1')), 4),
      ),
    );
    expect(r.finalHp.player).toBe(30);
    expect(r.finalHp.ghost).toBe(0);
    expect(r.endedAtTick).toBe(ONE_SHOT_TICK);
    expect(r.outcome).toBe('player_win');
  });
});

// ─── S7 — opponent-crossing status via the adjacency fan-out ────────

describe('CF-94 CP4 — a 0-HP combatant cannot apply status through adjacency', () => {
  // berserkers-greataxe (2x2 at col 0,row 0; tags weapon+metal) carries
  // on_low_health, which fires TOP-LEVEL at hpPct 0 and therefore reaches
  // fireAdjacentReactions. spark-stone at col 2,row 0 is edge-adjacent to the
  // greataxe cell (col 1,row 0) and its on_adjacent_trigger matches on the
  // 'weapon' tag, applying burn to the OPPONENT.
  //
  // ⚠ THE PLAYER WEAPON IS iron-dagger (cd 30), NOT iron-sword (cd 50), AND THAT
  // CHOICE IS LOAD-BEARING. The greataxe also carries on_cooldown at 50 ticks,
  // and fireTrigger runs fireAdjacentReactions on EVERY top-level fire — so with
  // a cd-50 player weapon the ghost's burn resolves during the tick-50 cooldown
  // phase while the ghost is still ALIVE, which the guard correctly permits and
  // which tests nothing. Killing the ghost at tick 30 leaves the greataxe's
  // cooldown unfired (accumulator 30 < 50), so the ONLY adjacency fan-out is the
  // post-mortem on_low_health one. This distinction was caught by the test going
  // green-for-the-wrong-reason on the first run.
  const adjacencyBurn = () =>
    simulateCombat(
      input(
        combatant(bag(placement('iron-dagger', 'p1')), 30),
        combatant(bag(placement('berserkers-greataxe', 'g1', 0, 0), placement('spark-stone', 'g2', 2, 0)), 2),
      ),
    );

  it('S7 — no burn reaches the opponent from a dead combatant', () => {
    // RED under NO GUARD: a status_apply burn event targeting the player exists.
    const r = adjacencyBurn();
    const burnedPlayer = r.events.some((e) => e.type === 'status_apply' && e.target === 'player');
    expect(burnedPlayer).toBe(false);
  });

  it('PRESERVED — the same dead combatant still resolves its SELF-SIDE buff_adjacent', () => {
    // The greataxe's own on_low_health effect is buff_adjacent, which is
    // structurally self-side and must survive. RED under an OVER-FIRING guard
    // (Route C) that suppresses every effect at 0 HP — this is the assertion that
    // separates CP4 from the route the locked ramp regression already refuted.
    const r = adjacencyBurn();
    const selfBuffApplied = r.events.some((e) => e.type === 'buff_apply' && e.target.side === 'ghost');
    expect(selfBuffApplied).toBe(true);
  });
});

// ─── Preservation — self-heals still resolve at 0 HP ────────────────

describe('CF-94 CP4 — a 0-HP combatant remains a valid target of heals', () => {
  it('S4-heal / S5 — on_low_health self-heal resolves at 0 HP and revives the combatant', () => {
    // iron-cap: on_low_health heal 10, threshold 50, maxTriggersPerCombat 1.
    // At tick 50 the ghost drops 4 -> 0 during damage resolution; the
    // on_low_health phase then runs at hpPct 0 and heals it back to its 4-HP
    // ceiling, so it survives the tick-50 death check. Its once-per-combat
    // budget is now spent (ruled: suppression consumes the budget), so the
    // tick-100 hit kills it.
    //
    // RED under an OVER-FIRING guard (Route C): the heal is suppressed, the ghost
    // dies at tick 50, and endedAtTick is 50 instead of 100.
    const r = simulateCombat(
      input(
        combatant(bag(placement('iron-sword', 'p1')), 30),
        combatant(bag(placement('iron-cap', 'g1')), 4),
      ),
    );
    expect(r.endedAtTick).toBe(100);
    expect(r.outcome).toBe('player_win');
    const revived = r.events.some(
      (e) => e.type === 'heal' && e.target === 'ghost' && e.tick === ONE_SHOT_TICK,
    );
    expect(revived).toBe(true);
  });
});
