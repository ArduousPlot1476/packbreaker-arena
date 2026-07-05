// M1.5b PR 3 / 5b.3a Commit 6 — persistence layer tests.
//
// Covers:
//   - save/load round-trip with an in-memory storage adapter
//   - clearLocal removes the key
//   - migrate dispatcher: v1 identity + unknown-version null + non-object null
//   - loadLocal corruption tolerance: returns null on malformed JSON,
//     unknown schemaVersion, non-object payload
//
// Client-tier storage primitives (./storage save/loadRaw/clearSave)
// are exercised transitively through the client composer wrappers
// (saveLocal / loadLocal / clearLocal).

import { describe, expect, it } from 'vitest';
import type {
  LocalSaveV1,
  SerializedRunState,
} from '@packbreaker/shared';
import type { SaveStorageAdapter } from './storage';
import { SAVE_STORAGE_KEY } from './storage';
import type {
  ClassId,
  ContractId,
  IsoDate,
  IsoTimestamp,
  PlacementId,
  RelicId,
  RoundNumber,
  RunId,
  RunOutcome,
  SimSeed,
} from '@packbreaker/content';
import { DEFAULT_RULESET } from '@packbreaker/content';
import { clearLocal, loadLocal, saveLocal } from './index';
import { migrate } from './migrations';
import { migrateV1Identity } from './migrations/v1';

function makeAdapter(initial: Record<string, string> = {}): SaveStorageAdapter & {
  store: Map<string, string>;
} {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

function makeSerializedRunState(
  overrides: Partial<SerializedRunState> = {},
): SerializedRunState {
  return {
    runId: 'run-12345' as RunId,
    seed: 12345 as SimSeed,
    classId: 'marauder' as ClassId,
    contractId: 'neutral' as ContractId,
    ruleset: DEFAULT_RULESET,
    derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 2 },
    startedAt: '2026-05-20T10:00:00.000Z' as IsoTimestamp,
    hearts: 3,
    gold: 14,
    currentRound: 4 as RoundNumber,
    bag: { dimensions: { width: 6, height: 4 }, placements: [] },
    relics: {
      starter: 'iron-will' as RelicId,
      mid: null,
      boss: null,
    },
    shop: { slots: [], purchased: [], rerollsThisRound: 0 },
    trophiesAtStart: 0,
    history: [],
    outcome: 'in_progress' as RunOutcome,
    rngState: 0x42424242,
    rerollCount: 0,
    trophy: 36,
    bornFromRecipe: [],
    ...overrides,
  };
}

function makeSave(overrides: Partial<LocalSaveV1> = {}): LocalSaveV1 {
  return {
    schemaVersion: 1,
    trophies: 0,
    dailyStreak: 0,
    lastDailyAttempted: null,
    tutorialCompleted: false,
    telemetryAnonId: '',
    inProgressRun: makeSerializedRunState(),
    ...overrides,
  };
}

describe('persistence — saveLocal/loadLocal round-trip', () => {
  it('round-trips a LocalSaveV1 through an in-memory storage adapter', () => {
    const adapter = makeAdapter();
    const original = makeSave({
      lastDailyAttempted: '2026-05-19' as IsoDate,
      tutorialCompleted: true,
      telemetryAnonId: 'uuid-abc-123',
    });
    saveLocal(original, adapter);
    const loaded = loadLocal(adapter);
    expect(loaded).toEqual(original);
  });

  it('preserves the full SerializedRunState in inProgressRun', () => {
    const adapter = makeAdapter();
    const original = makeSave({
      inProgressRun: makeSerializedRunState({
        currentRound: 7 as RoundNumber,
        hearts: 1,
        gold: 42,
        rngState: 0xdeadbeef,
        rerollCount: 3,
        trophy: 90,
        relics: {
          starter: 'iron-will' as RelicId,
          mid: 'berserkers-pendant' as RelicId,
          boss: null,
        },
      }),
    });
    saveLocal(original, adapter);
    const loaded = loadLocal(adapter);
    expect(loaded?.inProgressRun?.rngState).toBe(0xdeadbeef);
    expect(loaded?.inProgressRun?.rerollCount).toBe(3);
    expect(loaded?.inProgressRun?.trophy).toBe(90);
    expect(loaded?.inProgressRun?.relics.mid).toBe('berserkers-pendant');
  });

  it('CF 43: preserves bornFromRecipe membership through save→load', () => {
    const adapter = makeAdapter();
    const original = makeSave({
      inProgressRun: makeSerializedRunState({
        bornFromRecipe: ['p-0' as PlacementId, 'p-3' as PlacementId],
      }),
    });
    saveLocal(original, adapter);
    const loaded = loadLocal(adapter);
    expect(loaded?.inProgressRun?.bornFromRecipe).toEqual(['p-0', 'p-3']);
  });

  it('CF 43 backward-compat: a pre-fix save missing bornFromRecipe still loads (not discarded)', () => {
    // Pre-fix saves carry no bornFromRecipe field. JSON.stringify drops the
    // undefined key, simulating a legacy payload. bornFromRecipe is OPTIONAL at
    // the load boundary, so the save is NOT hard-rejected the way an absent
    // required field (rngState/trophy) would discard the whole run.
    const partial = makeSave();
    const legacy = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, bornFromRecipe: undefined as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(legacy) });
    const loaded = loadLocal(adapter);
    // Non-destructive: the in-progress run survives the load.
    expect(loaded).not.toBeNull();
    expect(loaded?.inProgressRun).not.toBeNull();
    // This boundary validates but does NOT transform, so the field is simply
    // absent on the raw loaded object; restoreRun materializes the [] default
    // (see restoreRun.test.ts: "tolerates a pre-fix snapshot").
    expect(loaded?.inProgressRun?.bornFromRecipe).toBeUndefined();
  });

  it('writes to the canonical pba.v1.save key', () => {
    const adapter = makeAdapter();
    saveLocal(makeSave(), adapter);
    expect(adapter.store.has(SAVE_STORAGE_KEY)).toBe(true);
    expect(SAVE_STORAGE_KEY).toBe('pba.v1.save');
  });

  it('serializes inProgressRun: null when no run is active', () => {
    const adapter = makeAdapter();
    saveLocal(makeSave({ inProgressRun: null }), adapter);
    const loaded = loadLocal(adapter);
    expect(loaded?.inProgressRun).toBeNull();
  });

  // Phase 2.5g meta-audit (Codex P1 round 3): clearLocal now
  // PRESERVES the device-scoped envelope (telemetryAnonId,
  // trophies, dailyStreak, lastDailyAttempted, tutorialCompleted)
  // and nulls only inProgressRun. The resurrection guard at
  // useRun.ts:188 already handles inProgressRun===null, so no
  // restore code change was needed.
  it('clearLocal preserves the envelope; nulls only inProgressRun (Phase 2.5g)', () => {
    const adapter = makeAdapter();
    saveLocal(makeSave(), adapter);
    expect(loadLocal(adapter)).not.toBeNull();
    clearLocal(adapter);
    // Key is STILL present (envelope preserved).
    expect(adapter.store.has(SAVE_STORAGE_KEY)).toBe(true);
    // loadLocal returns the envelope with inProgressRun nulled;
    // device fields survive intact.
    const after = loadLocal(adapter);
    expect(after).not.toBeNull();
    expect(after!.inProgressRun).toBeNull();
  });

  it('clearLocal is a no-op when no save exists (does NOT write a phantom envelope)', () => {
    const adapter = makeAdapter();
    // Pre-condition: no save in storage.
    expect(adapter.store.has(SAVE_STORAGE_KEY)).toBe(false);
    clearLocal(adapter);
    // Post-condition: still no save. clearLocal must not synthesize
    // an envelope where there was none.
    expect(adapter.store.has(SAVE_STORAGE_KEY)).toBe(false);
    expect(loadLocal(adapter)).toBeNull();
  });

  it('clearLocal preserves device-scoped fields across the clear (anonId invariant)', () => {
    const adapter = makeAdapter();
    // Seed a save with a known telemetryAnonId + non-default device
    // siblings. Post-clear, every device field must match.
    saveLocal(
      makeSave({
        telemetryAnonId: 'preserved-anon-uuid-12345',
        trophies: 42,
        dailyStreak: 7,
        lastDailyAttempted: '2026-05-22' as IsoDate,
        tutorialCompleted: true,
      }),
      adapter,
    );
    clearLocal(adapter);
    const after = loadLocal(adapter);
    expect(after).not.toBeNull();
    expect(after!.telemetryAnonId).toBe('preserved-anon-uuid-12345');
    expect(after!.trophies).toBe(42);
    expect(after!.dailyStreak).toBe(7);
    expect(after!.lastDailyAttempted).toBe('2026-05-22');
    expect(after!.tutorialCompleted).toBe(true);
    expect(after!.inProgressRun).toBeNull();
  });

  it('clearLocal is throw-safe under a throwing storage adapter (no propagation)', () => {
    // Throwing adapter: seed via direct map write, then poison getItem
    // + setItem. clearLocal's load+write should both fail silently.
    const adapter = makeAdapter();
    saveLocal(makeSave(), adapter);
    // Wrap getItem + setItem in throwing decorators while preserving
    // the underlying store. clearLocal's loadLocal call hits the
    // throwing getItem (loadRaw catches → returns null → clearLocal
    // bails as a no-op). Alternatively, if loadRaw still resolves
    // and setItem throws, storageSave swallows. Either way, no
    // throw escapes.
    const getOriginal = adapter.getItem.bind(adapter);
    const setOriginal = adapter.setItem.bind(adapter);
    adapter.getItem = (_k: string) => {
      throw new Error('storage unavailable');
    };
    adapter.setItem = (_k: string, _v: string) => {
      throw new Error('storage unavailable');
    };
    try {
      expect(() => clearLocal(adapter)).not.toThrow();
    } finally {
      adapter.getItem = getOriginal;
      adapter.setItem = setOriginal;
    }
  });
});

describe('persistence — loadLocal corruption tolerance', () => {
  it('returns null when the key is absent', () => {
    const adapter = makeAdapter();
    expect(loadLocal(adapter)).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: '{not valid json' });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('returns null when payload schemaVersion is unrecognized', () => {
    const adapter = makeAdapter({
      [SAVE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 2, trophies: 100 }),
    });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('returns null when payload is not an object', () => {
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify('not-an-object') });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('returns null when payload is null (JSON null)', () => {
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: 'null' });
    expect(loadLocal(adapter)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3a Phase 2.5h (Catch 22 / Class A) — load-boundary
// shape validator.
//
// Pre-remediation, the migrate dispatcher routed by schemaVersion=1
// alone and cast the payload to LocalSaveV1 with no structural
// validation. {schemaVersion: 1, ...garbage} would pass and throw
// downstream at restoreRun's relics.starter deref, the constructor's
// history.slice(), or the reducer arm's bag.placements.map(...).
//
// Post-fix: validateLocalSaveV1 rejects any structural mismatch. The
// load+restore path cannot throw on a validator-passing payload.
// ────────────────────────────────────────────────────────────────────

describe('persistence — load-boundary shape validator (Phase 2.5h)', () => {
  it('rejects {schemaVersion: 1} with no inProgressRun field — undefined inProgressRun is NOT null', () => {
    // The pre-fix useRun guard checked `=== null` which doesn't catch
    // undefined. The validator now requires inProgressRun to be
    // present (null OR an object); undefined fails the SerializedRunState
    // typeof check and propagates to validator rejection.
    const adapter = makeAdapter({
      [SAVE_STORAGE_KEY]: JSON.stringify({ schemaVersion: 1 }),
    });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has undefined relics', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, relics: undefined as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has null relics.starter', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: null, mid: null, boss: null },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has undefined history', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, history: undefined as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has undefined bag', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, bag: undefined as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has bag.placements not-array', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        bag: { dimensions: { width: 6, height: 4 }, placements: 'not-an-array' },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with a bag.placements element missing anchor', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        bag: {
          dimensions: { width: 6, height: 4 },
          placements: [{ placementId: 'p-0', itemId: 'iron-mace', rotation: 0 }],
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has undefined shop', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, shop: undefined as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has shop.slots not-array', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        shop: { slots: 'bogus', purchased: [], rerollsThisRound: 0 },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has shop.slots containing null', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        shop: { slots: [null], purchased: [], rerollsThisRound: 0 },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has invalid outcome string', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, outcome: 'bogus-outcome' },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has non-numeric hearts', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, hearts: 'three' as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload whose inProgressRun has NaN rngState (non-finite)', () => {
    // JSON.stringify(NaN) === 'null', so this round-trips as null and is
    // rejected by the numeric check.
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, rngState: NaN },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('accepts a fully-valid payload (validator does not over-reject)', () => {
    const adapter = makeAdapter();
    saveLocal(makeSave(), adapter);
    expect(loadLocal(adapter)).not.toBeNull();
  });

  it('accepts inProgressRun: null (explicit no-active-run sentinel)', () => {
    const adapter = makeAdapter();
    saveLocal(makeSave({ inProgressRun: null }), adapter);
    expect(loadLocal(adapter)?.inProgressRun).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3a Phase 2.5i (Catch 24 / Class A residual) — full
// contract validation + registry membership.
//
// Phase 2.5h validator validated a field-subset (the surfaces the
// 2.5g meta-audit enumerated). Codex finding #5 (P1) caught the gap:
// validator only checked classId/contractId/relicId as strings, not
// against CLASSES/CONTRACTS/RELICS, AND didn't validate ruleset or
// derived shape at all. applySimSnapshot at RunController.ts:192-193
// would then throw on `snapshot.ruleset.startingHearts` (undefined
// ruleset) or `CLASSES[snapshot.classId]!.displayName` (unknown
// classId), bypassing the fresh-run fallback.
//
// Rule 11 (codified at 5b.3a Phase 2.5i): a load-boundary validator
// must validate the COMPLETE persisted contract. Deref-safety is
// structural, not enumeration-dependent.
// ────────────────────────────────────────────────────────────────────

describe('persistence — full-contract validator + registry membership (Phase 2.5i)', () => {
  it('rejects a payload with unknown classId (string but not in CLASSES)', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        classId: 'invented-class' as unknown,
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with unknown contractId', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        contractId: 'bogus-contract' as unknown,
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with unknown starter relic id', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: 'mythic-unknown', mid: null, boss: null },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with unknown mid relic id (non-null but not in RELICS)', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: 'iron-will', mid: 'not-a-real-mid-relic', boss: null },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with unknown boss relic id', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: 'iron-will', mid: null, boss: 'phantom-boss-relic' },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with undefined ruleset', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, ruleset: undefined as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with non-object ruleset (string)', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, ruleset: 'not-a-ruleset' as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with ruleset missing startingHearts', () => {
    const partial = makeSave();
    const ruleset = { ...DEFAULT_RULESET } as Record<string, unknown>;
    delete ruleset.startingHearts;
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, ruleset },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with ruleset missing bagDimensions', () => {
    const partial = makeSave();
    const ruleset = { ...DEFAULT_RULESET } as Record<string, unknown>;
    delete ruleset.bagDimensions;
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, ruleset },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with ruleset.bagDimensions missing width', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        ruleset: { ...DEFAULT_RULESET, bagDimensions: { height: 4 } },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with ruleset.mutators not-array', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        ruleset: { ...DEFAULT_RULESET, mutators: 'not-array' as unknown },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with ruleset.mutators containing unknown mutator type', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        ruleset: {
          ...DEFAULT_RULESET,
          mutators: [{ type: 'invented_mutator_type' }],
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('accepts a payload with ruleset.mutators containing known boss_only mutator', () => {
    const partial = makeSave();
    const valid = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        ruleset: {
          ...DEFAULT_RULESET,
          mutators: [{ type: 'boss_only', hpOverride: 200, damageBonus: 5 }],
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(valid) });
    expect(loadLocal(adapter)).not.toBeNull();
  });

  it('rejects a payload with undefined derived', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, derived: undefined as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with derived missing extraRerollsPerRound', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        derived: { itemCostDelta: 0, bonusGoldOnWin: 2 } as unknown,
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with derived.bonusGoldOnWin as string', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: '2' as unknown },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3a Phase 2.5j (Catch 25 / Class A structural close) —
// Zod schema-derived validator closes the three Codex finding #6/#7/#8
// surfaces that the Phase 2.5h/2.5i hand-rolled validators missed.
//
// The hand-rolled approach validated id-typed fields as strings only;
// downstream code derefs ITEMS[id] / history[i].round and throws at
// render/usage time when the id is unknown or the entry is null. The
// schema-derived validator + ItemIdSchema (z.custom checking
// ITEMS-membership) + RunHistoryEntrySchema (full element shape)
// rejects the payloads upstream.
// ────────────────────────────────────────────────────────────────────

describe('persistence — schema-derived validator: Codex finding #6/#7/#8 surfaces (Phase 2.5j)', () => {
  // Codex finding #6: bag.placements[].itemId must be a known ITEMS id.
  it('rejects a payload with bag.placements[].itemId not in ITEMS', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        bag: {
          dimensions: { width: 6, height: 4 },
          placements: [
            {
              placementId: 'p-0',
              itemId: 'imaginary-bag-item',
              anchor: { col: 0, row: 0 },
              rotation: 0,
            },
          ],
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('accepts a payload with a known bag itemId (validator does not over-reject)', () => {
    const partial = makeSave();
    const valid = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        bag: {
          dimensions: { width: 6, height: 4 },
          placements: [
            {
              placementId: 'p-0',
              itemId: 'iron-mace',
              anchor: { col: 0, row: 0 },
              rotation: 0,
            },
          ],
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(valid) });
    expect(loadLocal(adapter)).not.toBeNull();
  });

  // Codex finding #7: shop.slots[] elements must each be a known ITEMS id.
  it('rejects a payload with shop.slots containing an unknown ITEMS id', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        shop: {
          slots: ['iron-mace', 'imaginary-shop-item'],
          purchased: [],
          rerollsThisRound: 0,
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('accepts a payload with shop.slots populated by known item ids', () => {
    const partial = makeSave();
    const valid = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        shop: {
          slots: ['iron-mace', 'iron-mace', 'iron-mace'],
          purchased: [],
          rerollsThisRound: 0,
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(valid) });
    expect(loadLocal(adapter)).not.toBeNull();
  });

  // Codex finding #8: history elements fully validated. Pre-Catch-25
  // `history: [null]` passed validation, then useRun's relic-offer
  // gating did `last.round === 11` on null and threw.
  it('rejects a payload with history: [null] (Codex finding 8)', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: { ...partial.inProgressRun, history: [null] as unknown },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with history element missing round', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        history: [
          {
            outcome: 'win',
            damageDealt: 30,
            damageTaken: 5,
            goldEarnedThisRound: 2,
            opponentGhostId: null,
            opponentClassId: null,
          },
        ],
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a payload with history element invalid outcome (not "win" | "loss")', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        history: [
          {
            round: 1,
            outcome: 'draw',
            damageDealt: 30,
            damageTaken: 5,
            goldEarnedThisRound: 2,
            opponentGhostId: null,
            opponentClassId: null,
          },
        ],
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('accepts a payload with a fully-valid history entry', () => {
    const partial = makeSave();
    const valid = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        history: [
          {
            round: 1,
            outcome: 'win',
            damageDealt: 30,
            damageTaken: 5,
            goldEarnedThisRound: 2,
            opponentGhostId: null,
            opponentClassId: 'marauder',
          },
        ],
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(valid) });
    expect(loadLocal(adapter)).not.toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3a Phase 2.5j-fix (Codex finding B, P2) — relic-slot
// semantic validation.
//
// Pre-fix, RelicSlotsSchema validated id ∈ RELICS via z.custom but did
// NOT enforce that RELICS[id].slot matched the field's expected slot.
// A boss-tier relic in the starter field would pass loadLocal, then
// composeRuleset would fold the boss modifiers in — granting modifier-
// stack bypass progression. Three new refines on RelicSlotsSchema:
// one per non-null slot field.
// ────────────────────────────────────────────────────────────────────

describe('persistence — relic-slot semantic validation (Phase 2.5j-fix / Finding B)', () => {
  it('rejects a boss-tier relic in the starter slot', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        // worldforge-seed: slot='boss'. Putting it in starter is mis-slotted.
        relics: { starter: 'worldforge-seed', mid: null, boss: null },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a mid-tier relic in the starter slot', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        // berserkers-pendant: slot='mid'.
        relics: { starter: 'berserkers-pendant', mid: null, boss: null },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a starter-tier relic in the mid slot', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: 'iron-will', mid: 'iron-will', boss: null },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a starter-tier relic in the boss slot', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: 'iron-will', mid: null, boss: 'iron-will' },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('rejects a mid-tier relic in the boss slot', () => {
    const partial = makeSave();
    const corrupted = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: 'iron-will', mid: null, boss: 'berserkers-pendant' },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(corrupted) });
    expect(loadLocal(adapter)).toBeNull();
  });

  it('accepts correctly-slotted relics (starter + mid + boss)', () => {
    const partial = makeSave();
    const valid = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        // iron-will: starter; berserkers-pendant: mid; conquerors-crown: boss.
        relics: {
          starter: 'iron-will',
          mid: 'berserkers-pendant',
          boss: 'conquerors-crown',
        },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(valid) });
    expect(loadLocal(adapter)).not.toBeNull();
  });

  it('accepts null mid/boss (optional slots still null)', () => {
    const partial = makeSave();
    const valid = {
      ...partial,
      inProgressRun: {
        ...partial.inProgressRun,
        relics: { starter: 'iron-will', mid: null, boss: null },
      },
    };
    const adapter = makeAdapter({ [SAVE_STORAGE_KEY]: JSON.stringify(valid) });
    expect(loadLocal(adapter)).not.toBeNull();
  });
});

describe('persistence — migration dispatcher', () => {
  it('migrate(v1 payload) returns the payload unchanged (identity)', () => {
    const v1 = makeSave({ telemetryAnonId: 'uuid-test' });
    const migrated = migrate(v1);
    expect(migrated).toEqual(v1);
  });

  it('migrate(unknown schemaVersion) returns null', () => {
    expect(migrate({ schemaVersion: 99 })).toBeNull();
  });

  it('migrate(missing schemaVersion) returns null', () => {
    expect(migrate({ trophies: 0 })).toBeNull();
  });

  it('migrate(non-object) returns null', () => {
    expect(migrate('string')).toBeNull();
    expect(migrate(42)).toBeNull();
    expect(migrate(null)).toBeNull();
    expect(migrate(undefined)).toBeNull();
  });

  it('migrateV1Identity returns the input by reference (no clone)', () => {
    const v1 = makeSave();
    const result = migrateV1Identity(v1);
    expect(result).toBe(v1);
  });
});

// ────────────────────────────────────────────────────────────────────
// M1.5b PR 3 / 5b.3a Phase 2.5 P2 (Catch 21) — throw-safe storage.
//
// Pre-fix: getDefaultStorage's property access on `globalThis.localStorage`
// could throw SecurityError on Safari private-browsing / opaque-origin
// / blocked-storage contexts, propagating up through loadLocal /
// saveLocal / clearLocal and breaking the no-op fallback contract.
// Similarly getItem/setItem/removeItem could throw at runtime
// (QuotaExceededError, partitioned storage, etc.).
//
// Post-fix: every browser-storage touchpoint is wrapped in try/catch
// with a null/no-op fallback. The mount path always survives.
// ────────────────────────────────────────────────────────────────────

function makeThrowingAdapter(throwOn: {
  getItem?: boolean;
  setItem?: boolean;
  removeItem?: boolean;
}): SaveStorageAdapter {
  return {
    getItem() {
      if (throwOn.getItem) throw new Error('SecurityError: getItem blocked');
      return null;
    },
    setItem() {
      if (throwOn.setItem) throw new Error('QuotaExceededError: setItem failed');
    },
    removeItem() {
      if (throwOn.removeItem) throw new Error('SecurityError: removeItem blocked');
    },
  };
}

describe('persistence — throw-safe storage adapter (Phase 2.5 P2)', () => {
  it('loadLocal returns null without throwing when getItem throws', () => {
    const adapter = makeThrowingAdapter({ getItem: true });
    expect(() => loadLocal(adapter)).not.toThrow();
    expect(loadLocal(adapter)).toBeNull();
  });

  it('saveLocal is a silent no-op when setItem throws (e.g. QuotaExceededError)', () => {
    const adapter = makeThrowingAdapter({ setItem: true });
    expect(() => saveLocal(makeSave(), adapter)).not.toThrow();
  });

  it('clearLocal is a silent no-op when removeItem throws', () => {
    const adapter = makeThrowingAdapter({ removeItem: true });
    expect(() => clearLocal(adapter)).not.toThrow();
  });

  it('full mount path survives a throwing storage: save → load → clear all no-op without throwing', () => {
    const adapter = makeThrowingAdapter({
      getItem: true,
      setItem: true,
      removeItem: true,
    });
    expect(() => saveLocal(makeSave(), adapter)).not.toThrow();
    expect(() => loadLocal(adapter)).not.toThrow();
    expect(loadLocal(adapter)).toBeNull();
    expect(() => clearLocal(adapter)).not.toThrow();
  });
});

describe('persistence — throw-safe globalThis.localStorage access (Phase 2.5 P2)', () => {
  it('loadLocal with default adapter returns null when globalThis.localStorage access throws', () => {
    // Replace globalThis.localStorage with a getter that throws (Safari
    // private-browsing emulation). The defensive try/catch around the
    // property access in getDefaultStorage should return null without
    // propagating the SecurityError.
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        get() {
          throw new Error('SecurityError: storage blocked');
        },
      });
      expect(() => loadLocal()).not.toThrow();
      expect(loadLocal()).toBeNull();
      expect(() => saveLocal(makeSave())).not.toThrow();
      expect(() => clearLocal()).not.toThrow();
    } finally {
      // Restore original localStorage descriptor for subsequent tests
      // (afterEach calls localStorage.clear() — without restore the
      // getter would throw at cleanup time).
      if (original) {
        Object.defineProperty(globalThis, 'localStorage', original);
      } else {
        delete (globalThis as { localStorage?: unknown }).localStorage;
      }
    }
  });
});
