// M1.5b PR 3 / 5b.3a Commit 6 — persistence layer tests.
//
// Covers:
//   - save/load round-trip with an in-memory storage adapter
//   - clearLocal removes the key
//   - migrate dispatcher: v1 identity + unknown-version null + non-object null
//   - loadLocal corruption tolerance: returns null on malformed JSON,
//     unknown schemaVersion, non-object payload
//
// Shared-package storage primitives (save/loadRaw/clearSave) are
// exercised transitively through the client wrappers (saveLocal/
// loadLocal/clearLocal).

import { describe, expect, it } from 'vitest';
import type {
  LocalSaveV1,
  SaveStorageAdapter,
  SerializedRunState,
} from '@packbreaker/shared';
import { SAVE_STORAGE_KEY } from '@packbreaker/shared';
import type {
  ClassId,
  ContractId,
  IsoDate,
  IsoTimestamp,
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

  it('clearLocal removes the saved key — subsequent loadLocal returns null', () => {
    const adapter = makeAdapter();
    saveLocal(makeSave(), adapter);
    expect(loadLocal(adapter)).not.toBeNull();
    clearLocal(adapter);
    expect(loadLocal(adapter)).toBeNull();
    expect(adapter.store.has(SAVE_STORAGE_KEY)).toBe(false);
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
