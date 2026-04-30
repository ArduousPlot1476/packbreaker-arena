// Bottom panel: combat log + last-round damage chart (collapsible, default
// collapsed per spec). M1.3.1 ports the prototype's static log line; chart
// + collapse mechanism land later in the visual styling pass.

export function BottomPanel() {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        height: 32,
        padding: '0 18px',
        background: 'var(--bg-mid)',
        borderTop: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center gap-3">
        <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          LOG
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          R3 · won vs ghost (Marauder) · 6 dmg dealt · 3 dmg taken
        </span>
      </div>
      <span
        className="label-cap"
        style={{ fontSize: 9, color: 'var(--text-muted)', cursor: 'pointer' }}
      >
        EXPAND ↑
      </span>
    </div>
  );
}
