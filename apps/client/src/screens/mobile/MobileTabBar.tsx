// Mobile bottom tab bar (390-wide vertical) per gdd.md § 14. Four
// tabs: [Shop] [Crafting] [Relics] [Log]. Default = Shop. Tab buttons
// each ≥ 84×56 to satisfy the 44×44 touch-target floor with margin.
//
// Tab content panels (ShopTab / CraftingTab / RelicsTab / LogTab)
// are rendered by MobileRunScreen above this bar; the bar itself is
// purely a tab-selection control. M1.3.3 commit 4 ships this shell;
// commit 5 adds the actual content panels.

export type MobileTab = 'shop' | 'crafting' | 'relics' | 'log';

interface MobileTabBarProps {
  active: MobileTab;
  onTabChange: (tab: MobileTab) => void;
}

const TABS: { id: MobileTab; label: string }[] = [
  { id: 'shop', label: 'SHOP' },
  { id: 'crafting', label: 'CRAFTING' },
  { id: 'relics', label: 'RELICS' },
  { id: 'log', label: 'LOG' },
];

export function MobileTabBar({ active, onTabChange }: MobileTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Mobile tabs"
      className="flex"
      style={{
        height: 56,
        background: 'var(--bg-mid)',
        borderTop: '1px solid var(--border-default)',
      }}
    >
      {TABS.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(t.id)}
            className="ease-snap label-cap"
            style={{
              flex: 1,
              minHeight: 44,
              border: 'none',
              borderTop: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              background: 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              fontSize: 11,
              fontWeight: isActive ? 700 : 600,
              cursor: 'pointer',
              transition: 'color 120ms cubic-bezier(0.16, 1, 0.3, 1), border-color 120ms',
              padding: '0 4px',
              touchAction: 'manipulation',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
