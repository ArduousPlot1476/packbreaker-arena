// Mobile Continue CTA — full-width bar at the very bottom edge per
// Trey's decision-7 ratification (option C, closes
// visual-direction.md § 13 question 4). Always visible regardless of
// active tab; user can tap Continue from any tab without switching
// back to [Shop] first.
//
// Position in the MobileRunScreen stack (top → bottom):
//   top bar (44) → bag (240) → tab content (~360) → tab bar (56)
//   → Continue CTA (56)  ← this component
//
// Touch-target compliance: full-width × 56px ≫ 44×44 WCAG AA floor.

interface MobileContinueCTAProps {
  onContinue: () => void;
  busy: boolean;
}

export function MobileContinueCTA({ onContinue, busy }: MobileContinueCTAProps) {
  return (
    <button
      type="button"
      onClick={onContinue}
      disabled={busy}
      className="ease-snap hover-lift label-cap"
      style={{
        width: '100%',
        minHeight: 56,
        padding: '14px 16px',
        background: busy ? 'var(--surface)' : 'var(--accent)',
        color: 'var(--text-primary)',
        fontWeight: 700,
        fontSize: 14,
        letterSpacing: '0.1em',
        border: 'none',
        cursor: busy ? 'not-allowed' : 'pointer',
        boxShadow: busy ? 'none' : '0 -4px 12px rgba(59,130,246,0.20)',
        touchAction: 'manipulation',
      }}
    >
      CONTINUE →
    </button>
  );
}
