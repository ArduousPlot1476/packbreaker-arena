// Unit tests for ItemIcon: rotation + scale transform applied to children;
// the canonical motion-language easing is set on the transition.

import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ItemIcon } from './ItemIcon';

const SNAP_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

describe('ItemIcon', () => {
  it('renders children inside the transform wrapper', () => {
    const { getByText } = render(
      <ItemIcon>
        <span>iron-sword</span>
      </ItemIcon>,
    );
    expect(getByText('iron-sword')).toBeInTheDocument();
  });

  it('applies rotate(0deg) scale(1) by default', () => {
    const { container } = render(
      <ItemIcon>
        <span>x</span>
      </ItemIcon>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toContain('rotate(0deg)');
    expect(wrapper.style.transform).toContain('scale(1)');
  });

  it('applies rotate(90deg) when rot=90', () => {
    const { container } = render(
      <ItemIcon rot={90}>
        <span>x</span>
      </ItemIcon>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toContain('rotate(90deg)');
  });

  it('applies rotate(180deg) when rot=180', () => {
    const { container } = render(
      <ItemIcon rot={180}>
        <span>x</span>
      </ItemIcon>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toContain('rotate(180deg)');
  });

  it('applies scale(0.5) when scale=0.5', () => {
    const { container } = render(
      <ItemIcon scale={0.5}>
        <span>x</span>
      </ItemIcon>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transform).toContain('scale(0.5)');
  });

  it('uses the snap easing curve from visual-direction.md § 7', () => {
    const { container } = render(
      <ItemIcon>
        <span>x</span>
      </ItemIcon>,
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.style.transition).toContain(SNAP_EASING);
  });
});
