// Unit tests for RarityGem: each of the 5 rarities renders a distinct
// SVG path/shape with the appropriate aria-label, and the consumer's
// color via currentColor flows through.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RarityGem, RARITY_GEM_SHAPE } from './RarityGem';
import type { RarityKey } from './rarity';

const RARITIES: RarityKey[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

describe('RarityGem', () => {
  RARITIES.forEach((rarity) => {
    it(`renders an SVG with aria-label="${rarity}"`, () => {
      const { container } = render(<RarityGem rarity={rarity} />);
      const svg = container.querySelector(`svg[aria-label="${rarity}"]`);
      expect(svg).not.toBeNull();
    });
  });

  it('common renders a 4-sided diamond shape (single <path>)', () => {
    const { container } = render(<RarityGem rarity="common" />);
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('path')).toHaveLength(1);
    expect(svg?.querySelectorAll('rect')).toHaveLength(0);
  });

  it('uncommon renders a square (<rect>, not <path>)', () => {
    const { container } = render(<RarityGem rarity="uncommon" />);
    const svg = container.querySelector('svg');
    expect(svg?.querySelectorAll('rect')).toHaveLength(1);
    expect(svg?.querySelectorAll('path')).toHaveLength(0);
  });

  it('all five rarity shapes are mapped in RARITY_GEM_SHAPE', () => {
    expect(Object.keys(RARITY_GEM_SHAPE).sort()).toEqual(
      ['common', 'epic', 'legendary', 'rare', 'uncommon'].sort(),
    );
  });

  it('uses currentColor for fill so consumer can color via parent', () => {
    const { container } = render(
      <div style={{ color: 'red' }}>
        <RarityGem rarity="rare" />
      </div>,
    );
    const filled = container.querySelector('[fill="currentColor"]');
    expect(filled).not.toBeNull();
  });
});
