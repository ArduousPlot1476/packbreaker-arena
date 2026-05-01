// Mobile run-screen orchestrator (390×844 vertical per gdd.md § 14
// + decision-log 2026-04-27 second style frame ratification).
//
// M1.3.3 commit 3 stub. Real implementation lands in commits 4–7:
//   - commit 4: MobileTopBar (compact gold/hearts/round + opponent
//     intent w/ silhouettes) + MobileTabBar shell + bag center.
//   - commit 5: ShopTab / CraftingTab / RelicsTab / LogTab content.
//   - commit 6: floating Continue CTA full-width bar.
//   - commit 7: @dnd-kit TouchSensor + tap-tap rotate + touch-target
//     audit + pinch/scroll lock.

export function MobileRunScreen() {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-deep)',
        color: 'var(--text-primary)',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div>
        <div
          className="label-cap"
          style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}
        >
          MOBILE LAYOUT
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Coming in M1.3.3 commit 4. Branching infrastructure verified at
          this commit; tab shell + content panels follow.
        </div>
      </div>
    </div>
  );
}
