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
    it(`renders with the correct gem (${RARITY[rarity].gem}) and border color for ${rarity}`, () => {
      const { container, getByText } = render(
        <RarityFrame rarity={rarity} size={88}>
          <span>icon</span>
        </RarityFrame>,
      );
      // Corner gem rendered.
      expect(getByText(RARITY[rarity].gem)).toBeInTheDocument();
      // Frame border uses the rarity color.
      const frame = container.firstElementChild as HTMLElement;
      expect(frame.style.border).toContain(RARITY[rarity].color);
    });
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
