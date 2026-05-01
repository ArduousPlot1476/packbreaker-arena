// Round-end overlay with reward summary + Continue. Extracted from the
// prototype's WinOverlay sub-component of CombatOverlay. Reward values
// are placeholder-baked for M1.3.1; M1.3.4 sim integration will pass
// real values from the resolved round.

import { CoinGlyph } from '../icons/icons';

interface RoundResolutionProps {
  onNext: () => void;
}

export function RoundResolution({ onNext }: RoundResolutionProps) {
  return (
    <div
      className="ease-snap"
      style={{
        width: 360,
        padding: 24,
        background: 'var(--surface-elev)',
        border: '2px solid #22C55E',
        borderRadius: 8,
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      <div className="label-cap" style={{ color: '#22C55E', fontSize: 12, marginBottom: 6 }}>
        ROUND 4 — VICTORY
      </div>
      <div className="heading-tight" style={{ fontSize: 32, marginBottom: 16 }}>
        You crushed the ghost.
      </div>
      <div className="flex items-center justify-center gap-6 mb-5">
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            GOLD
          </div>
          <div className="flex items-center gap-1 justify-center mt-1">
            <div style={{ width: 16, height: 16 }}>
              <CoinGlyph />
            </div>
            <span
              className="tnum heading-tight"
              style={{ fontSize: 22, color: 'var(--coin-fill)' }}
            >
              +1
            </span>
          </div>
        </div>
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            TROPHY
          </div>
          <div className="tnum heading-tight" style={{ fontSize: 22 }}>
            +18
          </div>
        </div>
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            HEARTS
          </div>
          <div className="tnum heading-tight" style={{ fontSize: 22, color: '#F87171' }}>
            3/3
          </div>
        </div>
      </div>
      <button
        onClick={onNext}
        className="ease-snap label-cap"
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 6,
          background: 'var(--accent)',
          color: '#FFFFFF',
          fontWeight: 700,
          fontSize: 12,
          letterSpacing: '0.08em',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        NEXT ROUND →
      </button>
    </div>
  );
}
