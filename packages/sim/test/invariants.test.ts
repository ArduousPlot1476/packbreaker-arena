import { describe, expect, it } from 'vitest';
import { invariant } from '../src/invariants';

describe('invariant', () => {
  it('does not throw on truthy', () => {
    expect(() => invariant(true, 'unreachable')).not.toThrow();
    expect(() => invariant(1, 'unreachable')).not.toThrow();
    expect(() => invariant('x', 'unreachable')).not.toThrow();
    expect(() => invariant({}, 'unreachable')).not.toThrow();
  });

  it('throws with the prefix and given message on falsy', () => {
    expect(() => invariant(false, 'must be true')).toThrow(/sim invariant: must be true/);
    expect(() => invariant(0, 'must be nonzero')).toThrow(/sim invariant: must be nonzero/);
    expect(() => invariant(null, 'must be defined')).toThrow(/sim invariant: must be defined/);
    expect(() => invariant(undefined, 'absent')).toThrow(/sim invariant: absent/);
  });

  it('narrows the type after assertion (compile-time check at use site)', () => {
    const value: string | undefined = 'present';
    invariant(value !== undefined, 'value must be defined');
    // post-invariant, TS knows value is string
    expect(value.length).toBe(7);
  });
});
