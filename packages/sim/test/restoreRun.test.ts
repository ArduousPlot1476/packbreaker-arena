// restoreRun.test.ts — M1.5b PR 3 / 5b.3a Commit 6 — sim restoreRun fidelity
// + post-load combat coverage.
//
// Round-trip: createRun + state-mutating ops (advancePhase, grantRelic) →
// capture snapshot via getState + getRngState → restoreRun(snapshot) →
// new controller's getState matches the captured snapshot's
// sim-authoritative slice (hearts, currentRound, history, outcome, relics,
// effectiveRuleset, derived).
//
// Post-load combat (the B2 hole): after restoreRun, the new controller
// can enterCombatPhase + applyCombatOutcome without corruption — hearts
// decrement on loss, history appends correctly, phase transitions hold.
//
// RNG cursor restore: a deterministic rng consumer (next shop generation)
// produces the same output before save and after restore, proving the
// cursor position was preserved through SerializedRunState.rngState.

import { describe, expect, it } from 'vitest';
import {
  ClassId,
  ContractId,
  GhostId,
  ItemId,
  PlacementId,
  RelicId,
  SimSeed,
  type RoundNumber,
  type SerializedRunState,
} from '@packbreaker/content';
import { createRun, restoreRun } from '../src/run';

const TINKER = ClassId('tinker');
const MARAUDER = ClassId('marauder');
const NEUTRAL = ContractId('neutral');
const APPRENTICES_LOOP = RelicId('apprentices-loop');
const IRON_WILL = RelicId('iron-will');
const BERSERKERS_PENDANT = RelicId('berserkers-pendant');

/** Convert a sim getState() snapshot + rng cursor + client-owned stubs to a
 *  SerializedRunState for testing. M1.5b PR 3 / 5b.3a wire-up calls this
 *  shape composition in useRun; here we build it directly for unit tests. */
function captureSerialized(
  controller: ReturnType<typeof createRun>,
  rerollCount = 0,
  trophy = 0,
): SerializedRunState {
  return {
    ...controller.getState(),
    rngState: controller.getRngState(),
    rerollCount,
    trophy,
    bornFromRecipe: controller.getRecipeBornPlacementIds(),
  };
}

describe('restoreRun — fidelity round-trip', () => {
  it('round-trips sim-authoritative state: createRun → snapshot → restoreRun → getState matches snapshot slice', () => {
    const original = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);

    const restored = restoreRun(snapshot);
    const restoredState = restored.getState();

    expect(restoredState.runId).toBe(snapshot.runId);
    expect(restoredState.seed).toBe(snapshot.seed);
    expect(restoredState.classId).toBe(snapshot.classId);
    expect(restoredState.contractId).toBe(snapshot.contractId);
    expect(restoredState.derived).toEqual(snapshot.derived);
    expect(restoredState.hearts).toBe(snapshot.hearts);
    expect(restoredState.currentRound).toBe(snapshot.currentRound);
    expect(restoredState.relics).toEqual(snapshot.relics);
    expect(restoredState.outcome).toBe(snapshot.outcome);
    expect(restoredState.history).toEqual(snapshot.history);
  });

  it('B-F3/E-F9 (M1.5e PR 1 Codex round 1): restoreRun hydrates the saved bag; a fresh mint after restore does not collide with restored ids', () => {
    const base = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const gs = base.getState();
    const item0 = gs.shop.slots[0]!;
    // Save with two placements (ids p-0, p-3, as if bought/placed). Restore does
    // not re-validate placement, so item shapes/cells are irrelevant here.
    const snapshot: SerializedRunState = {
      ...gs,
      bag: {
        dimensions: gs.bag.dimensions,
        placements: [
          { placementId: 'p-0', itemId: item0, anchor: { col: 4, row: 0 }, rotation: 0 },
          { placementId: 'p-3', itemId: item0, anchor: { col: 5, row: 0 }, rotation: 0 },
        ] as unknown as SerializedRunState['bag']['placements'],
      },
      rngState: base.getRngState(),
      rerollCount: 0,
      trophy: 0,
      bornFromRecipe: [],
    };

    const restored = restoreRun(snapshot);
    // B-F3: bag hydrated from the save (pre-fix restoreRun forced placements: []).
    expect(restored.getState().bag.placements.map((p) => p.placementId)).toEqual(['p-0', 'p-3']);

    // E-F9: the next minted id is past the highest restored id (p-3 → p-4), so a
    // buy→place after restore can't collide with a restored placement.
    restored.buyItem(0);
    const newPid = restored.placeItem(restored.getState().shop.slots[0]!, { col: 0, row: 0 }, 0);
    expect(newPid).toBe('p-4');
    expect(['p-0', 'p-3']).not.toContain(String(newPid));
  });

  it('round-trips Marauder + iron-will: ruleset recomposes with bonusHearts (hearts=4 not 3)', () => {
    const original = createRun({
      seed: 54321 as SimSeed,
      classId: MARAUDER,
      contractId: NEUTRAL,
      startingRelicId: IRON_WILL,
    });
    expect(original.getState().hearts).toBe(4);
    expect(original.getState().ruleset.startingHearts).toBe(4);

    const snapshot = captureSerialized(original);
    const restored = restoreRun(snapshot);
    expect(restored.getState().hearts).toBe(4);
    expect(restored.getState().ruleset.startingHearts).toBe(4);
  });

  it('round-trips mid-relic state: starter + mid both restore + effectiveRuleset reflects both', () => {
    const original = createRun({
      seed: 7777 as SimSeed,
      classId: MARAUDER,
      contractId: NEUTRAL,
      startingRelicId: IRON_WILL,
    });
    // Simulate a snapshot with both starter and mid granted, by composing
    // SerializedRunState directly with extended relics.
    const baseSnap = original.getState();
    const snapshot: SerializedRunState = {
      ...baseSnap,
      relics: {
        starter: IRON_WILL,
        mid: BERSERKERS_PENDANT,
        boss: null,
      },
      currentRound: 7 as RoundNumber,
      rngState: original.getRngState(),
      rerollCount: 0,
      trophy: 0,
      bornFromRecipe: [],
    };
    const restored = restoreRun(snapshot);
    expect(restored.getState().relics.starter).toBe(IRON_WILL);
    expect(restored.getState().relics.mid).toBe(BERSERKERS_PENDANT);
    expect(restored.getState().currentRound).toBe(7);
    expect(restored.getState().hearts).toBe(4);
  });

  it('restored controller phase is "arranging" when outcome === "in_progress"', () => {
    const original = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);
    const restored = restoreRun(snapshot);
    expect(restored.getPhase()).toBe('arranging');
  });

  it('restored controller phase is "ended" when outcome is terminal', () => {
    const original = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const baseSnap = original.getState();
    const terminalSnap: SerializedRunState = {
      ...baseSnap,
      outcome: 'eliminated',
      rngState: original.getRngState(),
      rerollCount: 0,
      trophy: 0,
      bornFromRecipe: [],
    };
    const restored = restoreRun(terminalSnap);
    expect(restored.getPhase()).toBe('ended');
  });

  it('throws when serialized.relics.starter is null (corrupt save indicator)', () => {
    const seed = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const baseSnap = seed.getState();
    const corruptSnap: SerializedRunState = {
      ...baseSnap,
      relics: { starter: null, mid: null, boss: null },
      rngState: seed.getRngState(),
      rerollCount: 0,
      trophy: 0,
      bornFromRecipe: [],
    };
    expect(() => restoreRun(corruptSnap)).toThrow(/relics\.starter is null/);
  });

  it('CF 43: bornFromRecipe membership survives save→restore (recipe-born placement keeps recipeBonusPct)', () => {
    const original = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const baseSnap = original.getState();
    // Stand in for a combineRecipe output (state.ts combineRecipe .add site):
    // a placement flagged recipe-born, plus its bag placement. Pre-CF-43 this
    // Set deserialized empty, silently dropping the recipe bonus after reload.
    const recipeBorn = PlacementId('p-0');
    const snapshot: SerializedRunState = {
      ...baseSnap,
      bag: {
        dimensions: baseSnap.bag.dimensions,
        placements: [
          {
            placementId: recipeBorn,
            itemId: baseSnap.shop.slots[0]!,
            anchor: { col: 0, row: 0 },
            rotation: 0,
          },
        ] as unknown as SerializedRunState['bag']['placements'],
      },
      bornFromRecipe: [recipeBorn],
      rngState: original.getRngState(),
      rerollCount: 0,
      trophy: 0,
    };

    const restored = restoreRun(snapshot);
    expect(restored.getRecipeBornPlacementIds()).toContain(recipeBorn);

    // Full persistence boundary: membership also survives a JSON round-trip.
    const viaJson = restoreRun(
      JSON.parse(JSON.stringify(snapshot)) as SerializedRunState,
    );
    expect(viaJson.getRecipeBornPlacementIds()).toContain(recipeBorn);
  });

  it('CF 43 backward-compat: restoreRun tolerates a pre-fix snapshot with no bornFromRecipe (empty membership, no throw)', () => {
    const original = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    // Legacy save: SerializedRunState with bornFromRecipe absent (the field is
    // optional). The client load boundary validates without transforming, so a
    // real legacy snapshot reaches restoreRun with the field undefined.
    const legacy: SerializedRunState = {
      ...original.getState(),
      rngState: original.getRngState(),
      rerollCount: 0,
      trophy: 0,
    };
    expect(legacy.bornFromRecipe).toBeUndefined();
    const restored = restoreRun(legacy);
    expect(restored.getRecipeBornPlacementIds()).toEqual([]);
  });

  it('CF 67 backward-compat: restoreRun tolerates a pre-CF-67 snapshot with no bossRewardItemId (materializes null, no throw)', () => {
    const original = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    // Legacy save: SerializedRunState with bossRewardItemId absent. getState() now
    // emits the field (null), so delete it to reproduce a genuine pre-CF-67
    // snapshot. The client load boundary validates without transforming (Rule 17),
    // so a real legacy snapshot reaches restoreRun with the field undefined;
    // restoreRun materializes it to null (`?? null`).
    const legacy = {
      ...original.getState(),
      rngState: original.getRngState(),
      rerollCount: 0,
      trophy: 0,
    };
    delete (legacy as { bossRewardItemId?: unknown }).bossRewardItemId;
    expect(legacy.bossRewardItemId).toBeUndefined();
    const restored = restoreRun(legacy as SerializedRunState);
    expect(restored.getState().bossRewardItemId).toBeNull();
  });

  it('CF 67: restoreRun preserves a set bossRewardItemId from the snapshot', () => {
    const original = createRun({
      seed: 12345 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snap: SerializedRunState = {
      ...original.getState(),
      bossRewardItemId: ItemId('world-forged-heart'),
      rngState: original.getRngState(),
      rerollCount: 0,
      trophy: 0,
    };
    const restored = restoreRun(snap);
    expect(restored.getState().bossRewardItemId).toBe('world-forged-heart');
  });
});

describe('restoreRun — RNG cursor restore', () => {
  it('post-restore rng cursor === saved cursor (terminal-seed invariant)', () => {
    // Phase 2.5h (Catch 23 / Class B) cursor-preservation invariant:
    // createRng(restoreFrom.rngState) is the TERMINAL RNG-relevant op
    // in the restore branch (makeShop was removed). Therefore
    // restored.getRngState() must equal snapshot.rngState verbatim —
    // no consumption between seed and observation.
    //
    // Pre-remediation this test asserted only that two restores produce
    // identical cursors (drift-equals-drift), which masked the
    // makeShop-induced cursor advancement. The corrected assertion
    // catches any future regression of the terminal-seed invariant.
    const original = createRun({
      seed: 99999 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);

    const restored = restoreRun(snapshot);

    expect(restored.getRngState()).toBe(snapshot.rngState);
  });

  it('restoreRun is deterministic given the same snapshot — two restores produce identical rng state', () => {
    // Companion determinism invariant — kept as a regression sentinel.
    // Under the verbatim-restore + terminal-seed fix this is trivially
    // true (both equal snapshot.rngState); under any future drift
    // regression it would catch a non-deterministic divergence between
    // two restores.
    const original = createRun({
      seed: 99999 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);

    const restoredA = restoreRun(snapshot);
    const restoredB = restoreRun(snapshot);

    expect(restoredA.getRngState()).toBe(restoredB.getRngState());
  });

  it('snapshot.rngState round-trips through JSON.stringify/parse without loss', () => {
    // Persistence path round-trip: SerializedRunState → JSON → parsed → use
    // as restoreRun input. rngState is a plain integer; JSON preserves it.
    // Post-Phase-2.5h: the JSON-roundtripped restore also satisfies the
    // terminal-seed invariant.
    const original = createRun({
      seed: 11111 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);
    const jsonRoundTripped = JSON.parse(JSON.stringify(snapshot)) as SerializedRunState;
    expect(jsonRoundTripped.rngState).toBe(snapshot.rngState);

    const restoredFromJson = restoreRun(jsonRoundTripped);
    expect(restoredFromJson.getRngState()).toBe(snapshot.rngState);
  });

  it('restoreRun produces a controller distinct from the original (separate Rng instances)', () => {
    const original = createRun({
      seed: 22222 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);
    const restored = restoreRun(snapshot);
    expect(restored).not.toBe(original);
  });
});

describe('restoreRun — shop verbatim restore (Phase 2.5h / Catch 23)', () => {
  it('restored shop slots match the snapshot verbatim (no regeneration)', () => {
    // Phase 2.5h shop-verbatim invariant: the restore branch no longer
    // calls makeShop. Sim's this.shop is restored byte-equal to
    // restoreFrom.shop. Combined with the save-side
    // clientShopToSimShop sourcing in useRun, this is what makes
    // save→load→save byte-stable.
    const original = createRun({
      seed: 31415 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);

    const restored = restoreRun(snapshot);
    const restoredShop = restored.getState().shop;

    expect(restoredShop.slots).toEqual(snapshot.shop.slots);
    expect(restoredShop.purchased).toEqual(snapshot.shop.purchased);
    expect(restoredShop.rerollsThisRound).toBe(snapshot.shop.rerollsThisRound);
  });

  it('save→load→save under zero player action is idempotent — rngState + shop stable', () => {
    // C-F1 / C-F2 idempotence falls out from verbatim-restore +
    // terminal-seed + save-side client-shop sourcing. Hand-roll a
    // snapshot, restore, capture again, and assert byte-equality on
    // the cursor + shop fields.
    const original = createRun({
      seed: 27182 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snap1 = captureSerialized(original);

    const restored = restoreRun(snap1);
    const snap2 = captureSerialized(restored);

    expect(snap2.rngState).toBe(snap1.rngState);
    expect(snap2.shop.slots).toEqual(snap1.shop.slots);
    expect(snap2.shop.purchased).toEqual(snap1.shop.purchased);
    expect(snap2.shop.rerollsThisRound).toBe(snap1.shop.rerollsThisRound);
  });
});

describe('restoreRun — post-load combat (B2 hole assertion)', () => {
  it('restored controller can run enterCombatPhase + applyCombatOutcome without throwing', () => {
    const original = createRun({
      seed: 22222 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);
    const restored = restoreRun(snapshot);

    expect(() => restored.enterCombatPhase()).not.toThrow();
    expect(restored.getPhase()).toBe('combat');

    expect(() =>
      restored.applyCombatOutcome({
        outcome: 'player_win',
        damageDealt: 30,
        damageTaken: 4,
        endedAtTick: 100,
        opponentGhostId: 'test-ghost' as GhostId,
        opponentClassId: TINKER,
      }),
    ).not.toThrow();
    expect(restored.getPhase()).toBe('resolution');
  });

  it('post-load applyCombatOutcome appends history entry + transitions phase correctly', () => {
    const original = createRun({
      seed: 33333 as SimSeed,
      classId: TINKER,
      contractId: NEUTRAL,
      startingRelicId: APPRENTICES_LOOP,
    });
    const snapshot = captureSerialized(original);
    const restored = restoreRun(snapshot);
    const historyLenBefore = restored.getState().history.length;

    restored.enterCombatPhase();
    restored.applyCombatOutcome({
      outcome: 'player_win',
      damageDealt: 30,
      damageTaken: 4,
      endedAtTick: 100,
      opponentGhostId: 'test-ghost' as GhostId,
      opponentClassId: TINKER,
    });

    const state = restored.getState();
    expect(state.history.length).toBe(historyLenBefore + 1);
    expect(state.history[state.history.length - 1]!.outcome).toBe('win');
    expect(state.history[state.history.length - 1]!.round).toBe(state.currentRound);
  });

  it('post-load applyCombatOutcome on loss decrements hearts correctly', () => {
    const original = createRun({
      seed: 44444 as SimSeed,
      classId: MARAUDER,
      contractId: NEUTRAL,
      startingRelicId: IRON_WILL,
    });
    expect(original.getState().hearts).toBe(4);
    const snapshot = captureSerialized(original);
    const restored = restoreRun(snapshot);
    expect(restored.getState().hearts).toBe(4);

    restored.enterCombatPhase();
    restored.applyCombatOutcome({
      outcome: 'ghost_win',
      damageDealt: 12,
      damageTaken: 30,
      endedAtTick: 100,
      opponentGhostId: 'test-ghost' as GhostId,
      opponentClassId: MARAUDER,
    });

    expect(restored.getState().hearts).toBe(3);
    expect(restored.getState().history[restored.getState().history.length - 1]!.outcome).toBe('loss');
  });
});
