// CF-87 route (D) — the ONE shared round-opponent chokepoint.
//
// decision-log.md 2026-07-24 § "CF-87 PHASE 1 RATIFIED: route (D) client-side
// canonical boss …" §§ 4, 5, 6, 8. Both the fight (CombatOverlay.buildCombatInput)
// and the pre-combat intent panel (ghostIntentForRound) consume THIS one
// derivation, so the panel's promise and the combat's reality stay a single
// source — ghostIntent's advertise-what-you-fight invariant holds by construction.
//
// Rounds 1–10 delegate to the ratified-disposable `makeGhostForRound` scaffolding
// UNCHANGED (this is now the ONE production call site of that generator — the
// quarantine the CF-85 arc set up, tightened from two sites to one). Round 11
// returns the balance-bible.md § 15 Forge Tyrant configuration assembled entirely
// from shipped content (FORGE_TYRANT + the forge-tyrant-boss mutators). Zero
// sim / content / schema / corpus change — the boss branch lives HERE, never
// inside makeGhostForRound (whose round-11 procedural output is pinned by
// ghost.test.ts).

import {
  CLASSES,
  CONTRACTS,
  ContractId,
  FORGE_TYRANT,
  type BagDimensions,
  type ClassId,
  type Combatant,
  type ContractMutator,
  type GhostId,
  type SimSeed,
} from '@packbreaker/content';
import { makeGhostForRound } from './ghost';

// The boss round is a LITERAL, comment-paired to the reward-gate literals at
// packages/sim/src/run/state.ts:915 / :956 (`lastRound !== 11`). Deliberately NOT
// `Ruleset.bossRound` — that field stays zero-consumer per decision-log.md
// 2026-07-24 § "CF-87 PHASE 1 RATIFIED …" § 6; its first consumer must convert
// BOTH this site AND the two reward-gate literals in one act.
const BOSS_ROUND = 11;

const FORGE_TYRANT_CONTRACT = ContractId('forge-tyrant-boss');
const FORGE_TYRANT_DISPLAY_LABEL = 'Forge Tyrant';

export interface RoundOpponent {
  /** The Combatant the sim fights this round. */
  readonly combatant: Combatant;
  readonly classId: ClassId;
  /** Opponent name for every UI surface (CombatScene portrait, the S2b reveal,
   *  the intent panel). "Forge Tyrant" at the boss round; the class display
   *  name otherwise. */
  readonly displayLabel: string;
  readonly ghostId: GhostId;
  /** Contract mutators forwarded to runCombat → simulateCombat and applied
   *  ghost-side (damageBonus → bonusBaseDamage, lifestealPctBonus → lifestealPct;
   *  packages/sim/src/combat.ts applyBossMutatorsToGhost). EMPTY off the boss
   *  round. `hpOverride` is NOT applied by the sim — see forgeTyrantOpponent. */
  readonly mutators: ReadonlyArray<ContractMutator>;
}

function titleCase(s: string): string {
  return s.length > 0 ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** The single derivation of "who does round N fight". Pure on (seed, round, dims). */
export function opponentForRound(
  seed: SimSeed,
  round: number,
  dims: BagDimensions,
): RoundOpponent {
  if (round === BOSS_ROUND) return forgeTyrantOpponent();

  const ghost = makeGhostForRound(seed, round, dims);
  return {
    combatant: ghost.combatant,
    classId: ghost.classId,
    displayLabel: CLASSES[ghost.classId]?.displayName ?? titleCase(ghost.classId),
    ghostId: ghost.id,
    mutators: [],
  };
}

function forgeTyrantOpponent(): RoundOpponent {
  const contract = CONTRACTS[FORGE_TYRANT_CONTRACT];
  if (!contract) {
    throw new Error(
      `opponentForRound: contract '${String(FORGE_TYRANT_CONTRACT)}' not in CONTRACTS`,
    );
  }
  const mutators = contract.ruleset.mutators;

  // hpOverride TWO-SITE SPLIT (decision-log.md 2026-07-24 § "CF-87 PHASE 1
  // RATIFIED …" § 8): simulateCombat NEVER applies `hpOverride` — only the run
  // controller's startCombatFromGhostBuild does, and route (D) does not traverse
  // it (computeStartingHpFromBag is module-private, unimportable). So the
  // chokepoint sets startingHp ITSELF from the mutator's hpOverride, while
  // damageBonus / lifestealPctBonus forward through `mutators` and are applied
  // ghost-side by the sim. One lookup, both sites.
  const startingHp = bossHpOverride(mutators);

  const combatant: Combatant = {
    bag: {
      dimensions: FORGE_TYRANT.bag.dimensions,
      placements: FORGE_TYRANT.bag.placements.slice(),
    },
    // Carry FORGE_TYRANT.relics VERBATIM — relics.boss = 'conquerors-crown'
    // (balance-bible.md § 13) feeds deriveSideStats. Copying makeGhostForRound's
    // all-null-relics pattern (ghost.ts:124) would silently strip the boss relic
    // and under-spec the fight — the ONE silent failure mode of this change (§ 8).
    relics: { ...FORGE_TYRANT.relics },
    classId: FORGE_TYRANT.classId,
    startingHp,
  };

  return {
    combatant,
    classId: FORGE_TYRANT.classId,
    displayLabel: FORGE_TYRANT_DISPLAY_LABEL,
    ghostId: FORGE_TYRANT.id,
    mutators,
  };
}

/** Pulls the boss_only hpOverride out of the forge-tyrant-boss mutators. The
 *  shipped contract always carries it (packages/content/src/contracts.ts: 50);
 *  reaching the throw means the contract lost its override. */
function bossHpOverride(mutators: ReadonlyArray<ContractMutator>): number {
  for (const m of mutators) {
    if (m.type === 'boss_only' && typeof m.hpOverride === 'number') return m.hpOverride;
  }
  throw new Error('opponentForRound: forge-tyrant-boss mutators carry no hpOverride');
}
