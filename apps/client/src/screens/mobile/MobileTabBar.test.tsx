// Unit tests for MobileTabBar. Verifies the 4-tab shell renders with
// the correct active-tab indicator + dispatches the right tab id on
// click + meets the ≥ 44×44 WCAG-AA touch-target floor.

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { MobileTabBar } from './MobileTabBar';

describe('MobileTabBar', () => {
  it('renders all 4 tabs', () => {
    const { getByRole } = render(
      <MobileTabBar active="shop" onTabChange={() => {}} />,
    );
    expect(getByRole('tab', { name: 'SHOP' })).toBeInTheDocument();
    expect(getByRole('tab', { name: 'CRAFTING' })).toBeInTheDocument();
    expect(getByRole('tab', { name: 'RELICS' })).toBeInTheDocument();
    expect(getByRole('tab', { name: 'LOG' })).toBeInTheDocument();
  });

  it('marks the active tab via aria-selected', () => {
    const { getByRole } = render(
      <MobileTabBar active="crafting" onTabChange={() => {}} />,
    );
    expect(getByRole('tab', { name: 'CRAFTING' })).toHaveAttribute('aria-selected', 'true');
    expect(getByRole('tab', { name: 'SHOP' })).toHaveAttribute('aria-selected', 'false');
  });

  it('dispatches onTabChange with the clicked tab id', () => {
    const onTabChange = vi.fn();
    const { getByRole } = render(
      <MobileTabBar active="shop" onTabChange={onTabChange} />,
    );
    fireEvent.click(getByRole('tab', { name: 'RELICS' }));
    expect(onTabChange).toHaveBeenCalledWith('relics');
    fireEvent.click(getByRole('tab', { name: 'LOG' }));
    expect(onTabChange).toHaveBeenCalledWith('log');
  });

  it('each tab button meets the 44×44 touch-target floor', () => {
    const { getAllByRole } = render(
      <MobileTabBar active="shop" onTabChange={() => {}} />,
    );
    const tabs = getAllByRole('tab');
    expect(tabs).toHaveLength(4);
    for (const t of tabs) {
      const minHeight = (t as HTMLElement).style.minHeight;
      expect(parseInt(minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
  });
});
