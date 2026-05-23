// identifiers.ts unit tests (M1.5c PR 1).

import { describe, expect, it } from 'vitest';
import {
  getOrCreateSessionId,
  resolveAnonId,
  __SESSION_STORAGE_KEY_FOR_TESTS as KEY,
} from './identifiers';

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

  it('falls back to a fresh uuid (not persisted) when storage throws', () => {
    const broken = new ThrowingStorage();
    const id = getOrCreateSessionId(broken);
    expect(id.length).toBeGreaterThan(0);
    // Second call returns a NEW uuid (no persistence available).
    const id2 = getOrCreateSessionId(broken);
    expect(id2).not.toBe(id);
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
