// Unit tests for RarityFrame: 5 rarity variants render correct frame
// border color + corner gem, plus shape (w/h) variations confirming
// the frame sizes correctly. Dual-coding via gem shapes is verified
// by the per-rarity gem assertions.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { RarityFrame } from './RarityFrame';
import { RARITY, type RarityKey } from './rarity';

const RARITIES: RarityKey[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

describe('RarityFrame — rarity variants', () => {
  RARITIES.forEach((rarity) => {
    it(`renders the SVG gem (aria-label "${rarity}") and border color for ${rarity}`, () => {
      const { container } = render(
        <RarityFrame rarity={rarity} size={88}>
          <span>icon</span>
        </RarityFrame>,
      );
      // Corner gem rendered as inline SVG with aria-label = rarity key.
      const gemSvg = container.querySelector(`svg[aria-label="${rarity}"]`);
      expect(gemSvg).not.toBeNull();
      // Frame border uses the rarity color (1px after M1.3.2 § 6 visual treatment).
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.style.border).toContain(RARITY[rarity].color);
      expect(frame.style.border).toContain('1px');
    });
  });

  it('inner-glow alpha + blur radius scale per rarity (M1.3.2 § 6)', () => {
    const measure = (rarity: 'common' | 'legendary') => {
      const { container } = render(
        <RarityFrame rarity={rarity} size={88}>
          <span>x</span>
        </RarityFrame>,
      );
      const frame = container.firstElementChild as HTMLElement;
      return frame.style.boxShadow;
    };
    const commonGlow = measure('common');
    const legendaryGlow = measure('legendary');
    // Common: 10px blur, 1A alpha → subtle.
    expect(commonGlow).toContain('10px');
    expect(commonGlow.toLowerCase()).toContain('1a');
    // Legendary: 22px blur, 57 alpha → prominent.
    expect(legendaryGlow).toContain('22px');
    expect(legendaryGlow.toLowerCase()).toContain('57');
  });
});

describe('RarityFrame — shape variations', () => {
  it('renders 1×1 at the requested size', () => {
    const { container } = render(
      <RarityFrame rarity="common" size={88}>
        <span>x</span>
      </RarityFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('88px');
    expect(frame.style.height).toBe('88px');
  });

  it('renders 1×2 (vertical) — width unchanged, height doubled', () => {
    const { container } = render(
      <RarityFrame rarity="rare" w={1} h={2} size={88}>
        <span>x</span>
      </RarityFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('88px');
    expect(frame.style.height).toBe('176px');
  });

  it('renders 2×1 (horizontal) — width doubled, height unchanged', () => {
    const { container } = render(
      <RarityFrame rarity="epic" w={2} h={1} size={88}>
        <span>x</span>
      </RarityFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('176px');
    expect(frame.style.height).toBe('88px');
  });

  it('renders 2×2 (square) — both doubled', () => {
    const { container } = render(
      <RarityFrame rarity="legendary" w={2} h={2} size={88}>
        <span>x</span>
      </RarityFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('176px');
    expect(frame.style.height).toBe('176px');
  });

  it('respects a non-default size (e.g. shop card 42px)', () => {
    const { container } = render(
      <RarityFrame rarity="uncommon" w={1} h={2} size={42}>
        <span>x</span>
      </RarityFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.width).toBe('42px');
    expect(frame.style.height).toBe('84px');
  });

  it('applies dim styling when dim=true', () => {
    const { container } = render(
      <RarityFrame rarity="common" size={88} dim>
        <span>x</span>
      </RarityFrame>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.style.opacity).toBe('0.55');
  });
});
