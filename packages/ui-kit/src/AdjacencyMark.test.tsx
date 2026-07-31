// CF-95b — the adjacency mark, and the constraints that make it safe to add a
// SECOND corner mark to a card that already carries two rarity signals.
//
// Every assertion here corresponds to a stated constraint, so a future change
// that quietly violates one fails by name rather than by screenshot.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { AdjacencyMark } from './AdjacencyMark';
import { RarityFrame } from './RarityFrame';
import { RARITY_GEM_SHAPE, RarityGem } from './RarityGem';
import type { RarityKey } from './rarity';

const RARITIES: RarityKey[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const frame = (props: { adjacency?: boolean; size?: number; rarity?: RarityKey }) =>
  render(
    <RarityFrame
      rarity={props.rarity ?? 'common'}
      size={props.size ?? 42}
      adjacency={props.adjacency}
    >
      <span>icon</span>
    </RarityFrame>,
  );

/** Query SCOPED to one render's own container. testing-library binds its
 *  queries to document.body, so a test that renders twice would otherwise
 *  match both trees and throw "found multiple elements" — a harness artefact
 *  that says nothing about the component. */
const markIn = (r: ReturnType<typeof frame>): HTMLElement | null =>
  r.container.querySelector('[data-testid="adjacency-mark"]');

describe('RarityFrame — adjacency mark opt-in', () => {
  it('is ABSENT by default (bag mounts and every existing caller are unchanged)', () => {
    const { queryByTestId } = frame({});
    expect(queryByTestId('adjacency-mark')).toBeNull();
  });

  it('is absent when explicitly false', () => {
    const { queryByTestId } = frame({ adjacency: false });
    expect(queryByTestId('adjacency-mark')).toBeNull();
  });

  it('renders when opted in', () => {
    const { getByTestId } = frame({ adjacency: true });
    expect(getByTestId('adjacency-mark')).toBeTruthy();
  });
});

describe('RarityFrame — adjacency mark geometry', () => {
  it('sits BOTTOM-LEFT, diagonally opposite the rarity gem', () => {
    const { getByTestId } = frame({ adjacency: true });
    const mark = getByTestId('adjacency-mark');
    expect(mark.style.bottom).toBe('3px');
    expect(mark.style.left).toBe('3px');
    // and never adopts the gem's corner
    expect(mark.style.top).toBe('');
    expect(mark.style.right).toBe('');
  });

  it('SHARES the gem sizing rule exactly — 8px at 42, 12px at 84', () => {
    // The mark must not carry an independent hand-tuned constant: a second
    // constant is free to drift from the first. Same formula, same numbers.
    const at42 = markIn(frame({ adjacency: true, size: 42 }));
    expect(at42?.style.width).toBe('8px');
    expect(at42?.style.height).toBe('8px');

    const at84 = markIn(frame({ adjacency: true, size: 84 }));
    expect(at84?.style.width).toBe('12px');
    expect(at84?.style.height).toBe('12px');
  });

  it('shares the gem 12x12 viewBox, so both corners have one geometry contract', () => {
    const { container } = render(<AdjacencyMark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('viewBox')).toBe('0 0 12 12');
  });
});

describe('RarityFrame — adjacency mark is NOT a third rarity signal', () => {
  it('is ACHROMATIC — never a rarity hue, and identical on every rarity', () => {
    // One color for all ten items: a binary flag, not a scale. If this ever
    // varies by rarity it has become a rarity signal.
    const colors = RARITIES.map(
      (rarity) => markIn(frame({ adjacency: true, rarity }))?.style.color,
    );
    expect(new Set(colors).size).toBe(1);
    expect(colors[0]).toBe('var(--text-primary)');
    // and is none of the five rarity hues, by construction
    for (const c of colors) expect(c).not.toMatch(/#|rgb/);
  });

  it('does not reuse ANY of the five rarity gem shapes', () => {
    const markPath = render(<AdjacencyMark />)
      .container.querySelector('path')
      ?.getAttribute('d');
    expect(markPath).toBeTruthy();

    const gemPaths = RARITIES.map((rarity) => {
      const { container } = render(<RarityGem rarity={rarity} />);
      const p = container.querySelector('path');
      // uncommon is a <rect>, not a <path> — absence is itself a distinction
      return p?.getAttribute('d') ?? container.querySelector('rect')?.outerHTML ?? '';
    });
    for (const gem of gemPaths) expect(markPath).not.toBe(gem);
    expect(Object.keys(RARITY_GEM_SHAPE)).toHaveLength(5);
  });

  it('carries its own aria-label, distinct from every rarity gem label', () => {
    const { container } = render(<AdjacencyMark />);
    const label = container.querySelector('svg')?.getAttribute('aria-label');
    expect(label).toBe('adjacency');
    expect(RARITIES).not.toContain(label as RarityKey);
  });

  it('coexists with the gem: BOTH corner marks render on a marked card', () => {
    const { container, getByTestId } = frame({ adjacency: true, rarity: 'epic' });
    expect(getByTestId('adjacency-mark')).toBeTruthy();
    expect(container.querySelector('svg[aria-label="epic"]')).not.toBeNull();
    expect(container.querySelector('svg[aria-label="adjacency"]')).not.toBeNull();
  });
});

describe('AdjacencyMark — greyscale survival is structural', () => {
  it('encodes meaning in SHAPE, not fill: currentColor only, no baked hue', () => {
    // Strip color and the mark must still be the only concave glyph present.
    // A hard-coded fill would make greyscale legibility a matter of luck.
    const { container } = render(<AdjacencyMark />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('fill')).toBe('currentColor');
    expect(svg?.outerHTML).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });

  it('is CONCAVE — four corner notches the convex rarity gems cannot mimic', () => {
    // The plus traces 12 vertices; all five rarity gems are convex hulls.
    // Vertex count is a cheap, stable proxy for "has notches".
    const d = render(<AdjacencyMark />).container.querySelector('path')?.getAttribute('d') ?? '';
    const vertices = (d.match(/[HV]\s*[\d.]+|[ML]\s*[\d.]+\s+[\d.]+/g) ?? []).length;
    expect(vertices).toBeGreaterThanOrEqual(12);
  });
});
