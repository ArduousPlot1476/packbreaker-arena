// identifiers.ts unit tests (M1.5c PR 1).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getOrCreateSessionId,
  resolveAnonId,
  __SESSION_STORAGE_KEY_FOR_TESTS as KEY,
  __resetFallbackForTests,
} from './identifiers';

// Reset the module-memoized fallback uuid between tests so each
// storage-denied test starts with a fresh memo.
beforeEach(() => {
  __resetFallbackForTests();
});
afterEach(() => {
  __resetFallbackForTests();
});

// In-memory Storage stub for sessionStorage isolation.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length(): number {
    return this.store.size;
  }
  key(i: number): string | null {
    return Array.from(this.store.keys())[i] ?? null;
  }
  getItem(k: string): string | null {
    return this.store.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.store.set(k, v);
  }
  removeItem(k: string): void {
    this.store.delete(k);
  }
  clear(): void {
    this.store.clear();
  }
}

class ThrowingStorage implements Storage {
  get length(): number {
    throw new Error('quota exceeded');
  }
  key(): string | null {
    throw new Error('quota exceeded');
  }
  getItem(): string | null {
    throw new Error('quota exceeded');
  }
  setItem(): void {
    throw new Error('quota exceeded');
  }
  removeItem(): void {
    throw new Error('quota exceeded');
  }
  clear(): void {
    throw new Error('quota exceeded');
  }
}

describe('identifiers — getOrCreateSessionId', () => {
  it('generates a fresh uuid on first call per storage', () => {
    const storage = new MemoryStorage();
    const id = getOrCreateSessionId(storage);
    expect(id.length).toBeGreaterThan(0);
    expect(storage.getItem(KEY)).toBe(id);
  });

  it('returns the same uuid on subsequent calls (per-tab persistence)', () => {
    const storage = new MemoryStorage();
    const a = getOrCreateSessionId(storage);
    const b = getOrCreateSessionId(storage);
    expect(a).toBe(b);
  });

  it('distinct storage = distinct uuid (per-tab isolation simulation)', () => {
    const tabA = new MemoryStorage();
    const tabB = new MemoryStorage();
    const a = getOrCreateSessionId(tabA);
    const b = getOrCreateSessionId(tabB);
    expect(a).not.toBe(b);
  });

  // Phase 2.5 round 2 / Catch 21 lineage: storage method throws
  // (getItem/setItem) → fall back to memoized uuid. Stable across
  // repeated calls in the same session (was: re-generated per call,
  // pre-fix — that meant telemetry from one tab visit got attributed
  // to multiple "sessions" once storage went down).
  it('falls back to a memoized stable uuid when storage method throws', () => {
    const broken = new ThrowingStorage();
    const id = getOrCreateSessionId(broken);
    expect(id.length).toBeGreaterThan(0);
    const id2 = getOrCreateSessionId(broken);
    expect(id2).toBe(id); // STABLE — single session, single fallback uuid
  });

  it('honors a pre-seeded sessionId (legacy session preservation)', () => {
    const storage = new MemoryStorage();
    storage.setItem(KEY, 'preexisting-uuid');
    expect(getOrCreateSessionId(storage)).toBe('preexisting-uuid');
  });
});

describe('identifiers — resolveAnonId', () => {
  it('returns the persisted value when non-empty', () => {
    expect(resolveAnonId('abc-def-123')).toBe('abc-def-123');
  });

  it('generates a fresh uuid when persisted is null', () => {
    const id = resolveAnonId(null);
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates a fresh uuid when persisted is undefined', () => {
    const id = resolveAnonId(undefined);
    expect(id.length).toBeGreaterThan(0);
  });

  it('generates a fresh uuid when persisted is empty string', () => {
    const id = resolveAnonId('');
    expect(id.length).toBeGreaterThan(0);
  });

  it('two empty resolves produce distinct uuids (no shared state)', () => {
    const a = resolveAnonId('');
    const b = resolveAnonId('');
    expect(a).not.toBe(b);
  });
});

// ────────────────────────────────────────────────────────────────────
// Phase 2.5 round 2 (5c PR 1 / Codex P1 round 2) — property-access
// throw safety + fallback memoization.
//
// Pre-fix: getOrCreateSessionId() evaluated `sessionStorage` in a
// ternary BEFORE entering the try block. On opaque-origin / blocked-
// storage contexts the property read itself throws SecurityError —
// `typeof sessionStorage` is safe but `sessionStorage` is the
// dereference. The exception escaped getOrCreateSessionId and
// crashed useRun mount.
//
// Post-fix: getDefaultSessionStorage() wraps the property read in
// try/catch (mirrors storage.ts:51-63 getDefaultStorage / Catch 19
// lineage). The fallback uuid is module-memoized so storage-denied
// sessions get a stable id across repeated calls.
// ────────────────────────────────────────────────────────────────────

describe('identifiers — Phase 2.5 round 2 throw-safety + memoization', () => {
  it('survives a SecurityError on the sessionStorage property access (does NOT throw)', () => {
    // Mock the global sessionStorage getter to throw on property
    // read — simulates Safari private-mode / opaque-origin /
    // sandboxed-iframe with disabled storage. Critical: install the
    // getter BEFORE calling getOrCreateSessionId() with no storage
    // arg, so the function takes the global-resolution path.
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      'sessionStorage',
    );
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled');
      },
    });
    try {
      let id: string | null = null;
      expect(() => {
        id = getOrCreateSessionId();
      }).not.toThrow();
      expect(id).not.toBeNull();
      expect((id as unknown as string).length).toBeGreaterThan(0);
    } finally {
      // Restore the original sessionStorage descriptor so the rest
      // of the suite (and the test runner shutdown) doesn't keep
      // hitting the throwing getter.
      if (original !== undefined) {
        Object.defineProperty(globalThis, 'sessionStorage', original);
      } else {
        // happy-dom's sessionStorage came from somewhere — if no
        // descriptor existed pre-test, remove the throwing one we
        // installed.
        delete (globalThis as unknown as { sessionStorage?: Storage })
          .sessionStorage;
      }
    }
  });

  it('memoized fallback is stable across repeated property-throw calls in the same session', () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      'sessionStorage',
    );
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled');
      },
    });
    try {
      const id1 = getOrCreateSessionId();
      const id2 = getOrCreateSessionId();
      const id3 = getOrCreateSessionId();
      expect(id2).toBe(id1);
      expect(id3).toBe(id1);
    } finally {
      if (original !== undefined) {
        Object.defineProperty(globalThis, 'sessionStorage', original);
      } else {
        delete (globalThis as unknown as { sessionStorage?: Storage })
          .sessionStorage;
      }
    }
  });

  it('memoized fallback uuid is shared between property-throw and method-throw paths (single session, one fallback)', () => {
    // First call: storage method throws → memo populated.
    const id1 = getOrCreateSessionId(new ThrowingStorage());
    // Second call: storage property access throws → memo returned,
    // not regenerated.
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      'sessionStorage',
    );
    Object.defineProperty(globalThis, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('SecurityError: storage disabled');
      },
    });
    try {
      const id2 = getOrCreateSessionId();
      expect(id2).toBe(id1);
    } finally {
      if (original !== undefined) {
        Object.defineProperty(globalThis, 'sessionStorage', original);
      } else {
        delete (globalThis as unknown as { sessionStorage?: Storage })
          .sessionStorage;
      }
    }
  });

  it('happy path intact: with working sessionStorage, persists + returns the stored id', () => {
    // Use an explicit MemoryStorage to isolate from any happy-dom
    // sessionStorage state. The happy-path contract: first call
    // generates+persists; second call reads the persisted value.
    const storage = new MemoryStorage();
    const fresh = getOrCreateSessionId(storage);
    expect(storage.getItem(KEY)).toBe(fresh);
    const second = getOrCreateSessionId(storage);
    expect(second).toBe(fresh);
  });
});
