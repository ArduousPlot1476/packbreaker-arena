import { describe, expect, it } from 'vitest';
import { applyBp, applyPct, clamp, sumInts } from '../src/math';

describe('applyPct', () => {
  it('+10% on 100 → 110', () => {
    expect(applyPct(100, 10)).toBe(110);
  });

  it('-25% on 100 → 75', () => {
    expect(applyPct(100, -25)).toBe(75);
  });

  it('+25% on 7 → 8 (floor of 8.75)', () => {
    expect(applyPct(7, 25)).toBe(8);
  });

  it('+100% on 0 → 0', () => {
    expect(applyPct(0, 100)).toBe(0);
  });

  it('+0% on any int is identity', () => {
    expect(applyPct(42, 0)).toBe(42);
    expect(applyPct(-17, 0)).toBe(-17);
  });

  it('-100% on positive → 0', () => {
    expect(applyPct(50, -100)).toBe(0);
  });

  it('rejects float base — returns NaN', () => {
    expect(applyPct(10.5, 25)).toBeNaN();
  });

  it('rejects float pct — returns NaN', () => {
    expect(applyPct(100, 10.5)).toBeNaN();
  });
});

describe('applyBp', () => {
  it('1.0× (10000 bp) is identity', () => {
    expect(applyBp(100, 10000)).toBe(100);
  });

  it('0.5× (5000 bp) halves', () => {
    expect(applyBp(100, 5000)).toBe(50);
  });

  it('0.5× on 7 → 3 (floor of 3.5)', () => {
    expect(applyBp(7, 5000)).toBe(3);
  });

  it('0× (0 bp) → 0', () => {
    expect(applyBp(100, 0)).toBe(0);
  });

  it('rejects float base/bp', () => {
    expect(applyBp(7.5, 5000)).toBeNaN();
    expect(applyBp(100, 5000.5)).toBeNaN();
  });
});

describe('clamp', () => {
  it('value within range is returned unchanged', () => {
    expect(clamp(5, 1, 10)).toBe(5);
  });

  it('value below range clamps to min', () => {
    expect(clamp(-5, 1, 10)).toBe(1);
  });

  it('value above range clamps to max', () => {
    expect(clamp(15, 1, 10)).toBe(10);
  });

  it('value equal to min/max passes through', () => {
    expect(clamp(1, 1, 10)).toBe(1);
    expect(clamp(10, 1, 10)).toBe(10);
  });

  it('rejects float on any arg', () => {
    expect(clamp(5.5, 1, 10)).toBeNaN();
    expect(clamp(5, 1.5, 10)).toBeNaN();
    expect(clamp(5, 1, 10.5)).toBeNaN();
  });
});

describe('sumInts', () => {
  it('sums three integers', () => {
    expect(sumInts([1, 2, 3])).toBe(6);
  });

  it('returns 0 for empty input', () => {
    expect(sumInts([])).toBe(0);
  });

  it('handles negatives', () => {
    expect(sumInts([10, -3, 5, -2])).toBe(10);
  });

  it('rejects any float in the list — returns NaN', () => {
    expect(sumInts([1, 2.5, 3])).toBeNaN();
  });

  it('NaN on float happens regardless of position', () => {
    expect(sumInts([1.5, 2, 3])).toBeNaN();
    expect(sumInts([1, 2, 3.5])).toBeNaN();
  });
});
