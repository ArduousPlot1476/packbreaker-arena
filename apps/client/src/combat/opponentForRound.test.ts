// CF-87 route (D) — the shared round-opponent chokepoint.
//
// Proves: round 11 fights the balance-bible.md § 15 Forge Tyrant configuration
// (bag / 50 HP / conquerors-crown relic / Tyrant's Wrath mutators), rounds 1–10
// stay byte-identical to the procedural generator, the intent panel and the
// fight are one derivation, and the boss's damageBonus / lifesteal / relic
// stats demonstrably reach the sim.
//
// CombatScene is mocked so importing CombatOverlay (for buildCombatInput) does
// not pull Phaser into happy-dom — mirrors combatParity.e2e.test.ts.

import { describe, expect, it, vi } from 'vitest';
import {
  BASE_COMBATANT_HP,
  ClassId,
  CONTRACTS,
  ContractId,
  FORGE_TYRANT,
  ItemId,
  PlacementId,
  SimSeed,
  type BagDimensions,
  type BagPlacement,
  type CombatEvent,
  type CombatInput,
  type CombatResult,
  type Combatant,
  type ContractMutator,
} from '@packbreaker/content';

// vitest hoists vi.mock above the imports below, so buildCombatInput's
// transitive CombatScene (Phaser) import resolves to this stub in happy-dom.
vi.mock('./CombatScene', () => ({
  createCombatGame: vi.fn(),
  CombatScene: { KEY: 'MockedCombatScene' },
  PORTRAIT_X_RATIO_PLAYER: 0.25,
  PORTRAIT_X_RATIO_GHOST: 0.75,
  PORTRAIT_Y_RATIO: 0.5,
}));

import { opponentForRound } from './opponentForRound';
import { makeGhostForRound } from './ghost';
import { ghostIntentForRound, selectMarqueeItemIds } from './ghostIntent';
import { runCombat } from './sim-bridge.combat';
import { buildCombatInput } from './CombatOverlay';
import { simBagToClientBag } from '../run/sim-bridge';

const DIMS: BagDimensions = { width: 6, height: 4 };
const SEED = SimSeed(12345);
const NO_RELICS = { starter: null, mid: null, boss: null } as const;

// ── combat helpers ─────────────────────────────────────────────────
function inputVs(
  ghost: Combatant,
  playerPlacements: ReadonlyArray<BagPlacement>,
  playerHp: number,
): CombatInput {
  return {
    seed: SEED,
    player: {
      bag: { dimensions: DIMS, placements: [...playerPlacements] },
      relics: { ...NO_RELICS },
      classId: ClassId('tinker'),
      startingHp: playerHp,
    },
    ghost,
  };
}

const damageEvents = (r: CombatResult) =>
  r.events.filter((e): e is Extract<CombatEvent, { type: 'damage' }> => e.type === 'damage');

/** Amount of the first boss→player damage event. With an empty player the only
 *  damage source is the boss, so this isolates the boss's flat bonusBaseDamage
 *  (marauder passive + conquerors-crown relic + boss_only damageBonus). */
function firstBossHit(ghost: Combatant, mutators?: ReadonlyArray<ContractMutator>): number {
  const r = runCombat(inputVs(ghost, [], 1000), mutators);
  const first = damageEvents(r).find((e) => e.target === 'player');
  if (!first) throw new Error('no boss→player damage event');
  return first.amount;
}

/** Total HP the ghost (boss) side recovered via heal events — lifesteal heals
 *  target the boss side and fire only when lifestealPct > 0 AND the boss is
 *  below max HP, so a player weapon that dents the boss is required to see them. */
function ghostHealTotal(r: CombatResult): number {
  return r.events
    .filter((e): e is Extract<CombatEvent, { type: 'heal' }> => e.type === 'heal' && e.target === 'ghost')
    .reduce((sum, e) => sum + e.amount, 0);
}

// ── Test 1 — round 11 IS the § 15 Forge Tyrant ─────────────────────
describe('opponentForRound — round 11 boss configuration', () => {
  it('carries FORGE_TYRANT bag, startingHp 50, conquerors-crown relic, and the Tyrant mutators', () => {
    const boss = opponentForRound(SEED, 11, DIMS);

    expect(boss.combatant.bag.placements).toEqual(FORGE_TYRANT.bag.placements);
    expect(boss.combatant.bag.dimensions).toEqual(FORGE_TYRANT.bag.dimensions);
    expect(boss.combatant.startingHp).toBe(50);
    expect(boss.combatant.relics.boss).toBe('conquerors-crown');
    expect(boss.combatant.classId).toBe('marauder');
    expect(boss.displayLabel).toBe('Forge Tyrant');
    expect(boss.ghostId).toBe('forge-tyrant');

    // mutators are the shipped forge-tyrant-boss ones, forwarded verbatim
    expect(boss.mutators).toEqual(
      CONTRACTS[ContractId('forge-tyrant-boss')]!.ruleset.mutators,
    );
    expect(boss.mutators).toContainEqual({
      type: 'boss_only',
      hpOverride: 50,
      damageBonus: 2,
      lifestealPctBonus: 15,
    });
  });
});

// ── Test 2 — relic-derived stats reach the fight (the SILENT failure) ─
describe('opponentForRound — conquerors-crown affects the fight (Rule 28)', () => {
  it('the boss deals +4 more on its first hit with the relic than with relics stripped', () => {
    const boss = opponentForRound(SEED, 11, DIMS);
    // Presence guard (Test 1 axis) — this alone goes red if the relic is stripped.
    expect(boss.combatant.relics.boss).toBe('conquerors-crown');

    // Both arms keep the same mutators, so the ONLY difference is the relic.
    // conquerors-crown carries bonusBaseDamage: 4 (balance-bible.md § 13).
    const stripped: Combatant = { ...boss.combatant, relics: { ...NO_RELICS } };
    const withRelic = firstBossHit(boss.combatant, boss.mutators);
    const withoutRelic = firstBossHit(stripped, boss.mutators);

    expect(withRelic - withoutRelic).toBe(4);
  });
});

// ── Test 3 — rounds 1–10 UNCHANGED, byte-identical to the generator ─
describe('opponentForRound — rounds 1–10 are the procedural ghost, unchanged', () => {
  it('returns the makeGhostForRound combatant verbatim with empty mutators', () => {
    for (let round = 1; round <= 10; round++) {
      const opponent = opponentForRound(SEED, round, DIMS);
      const generated = makeGhostForRound(SEED, round, DIMS);
      expect(opponent.combatant).toEqual(generated.combatant);
      expect(opponent.classId).toBe(generated.classId);
      expect(opponent.ghostId).toBe(generated.id);
      expect(opponent.mutators).toEqual([]);
    }
  });

  it('round 11 procedural HP pin is NOT what the chokepoint returns (proves the branch is outside makeGhostForRound)', () => {
    // ghost.test.ts pins makeGhostForRound(11).startingHp === BASE + 10 = 40.
    expect(makeGhostForRound(SEED, 11, DIMS).combatant.startingHp).toBe(BASE_COMBATANT_HP + 10);
    // The chokepoint overrides that to the boss's 50 without touching the generator.
    expect(opponentForRound(SEED, 11, DIMS).combatant.startingHp).toBe(50);
  });
});

// ── Test 4 — intent panel and the fight are ONE derivation ─────────
describe('ghostIntentForRound / buildCombatInput parity at round 11', () => {
  it('advertise-what-you-fight: same opponent, label, and marquee', () => {
    const intent = ghostIntentForRound(SEED, 11, DIMS);
    const { input, ghostClass, ghostClassId } = buildCombatInput(
      simBagToClientBag({ dimensions: DIMS, placements: [] }),
      {
        seed: SEED,
        round: 11,
        classId: ClassId('tinker'),
        relics: { ...NO_RELICS },
        ruleset: { bagDimensions: DIMS },
      } as unknown as Parameters<typeof buildCombatInput>[1],
      { startingHp: 40, recipeBornPlacementIds: [] },
    );

    // Same label on both surfaces.
    expect(intent.classLabel).toBe('Forge Tyrant');
    expect(ghostClass).toBe('Forge Tyrant');
    // Same class.
    expect(intent.classId).toBe(input.ghost.classId);
    expect(ghostClassId).toBe('marauder');
    // The fight fights the § 15 bag …
    expect(input.ghost.bag.placements).toEqual(FORGE_TYRANT.bag.placements);
    // … and the intent's marquee is derived from that same bag.
    expect(intent.marqueeItemIds).toEqual(selectMarqueeItemIds(FORGE_TYRANT.bag.placements));
    expect(intent.marqueeItemIds.length).toBeGreaterThan(0);
  });
});

// ── Test 6 — damageBonus and lifestealPctBonus reach the sim ────────
describe('boss_only mutators reach the sim', () => {
  it('damageBonus (+2) raises the boss first-hit amount by exactly 2', () => {
    const boss = opponentForRound(SEED, 11, DIMS);
    const withMutators = firstBossHit(boss.combatant, boss.mutators);
    const withoutMutators = firstBossHit(boss.combatant, []);
    expect(withMutators - withoutMutators).toBe(2);
  });

  it('lifestealPctBonus (+15%) heals the boss more when the boss is dented', () => {
    const boss = opponentForRound(SEED, 11, DIMS);
    // A player weapon so the boss drops below max HP → lifesteal has room to
    // heal. High player HP so the fight lasts and lifesteal accrues.
    const playerWeapon: BagPlacement[] = [
      { placementId: PlacementId('p-sword'), itemId: ItemId('iron-sword'), anchor: { col: 0, row: 0 }, rotation: 0 },
    ];
    const withMutators = runCombat(inputVs(boss.combatant, playerWeapon, 1000), boss.mutators);
    const withoutMutators = runCombat(inputVs(boss.combatant, playerWeapon, 1000), []);
    expect(ghostHealTotal(withMutators)).toBeGreaterThan(ghostHealTotal(withoutMutators));
  });
});
