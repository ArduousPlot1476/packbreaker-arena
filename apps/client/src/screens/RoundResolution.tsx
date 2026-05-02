// Round-end overlay with reward summary + Continue. Was the prototype's
// WinOverlay sub-component of CombatOverlay; M1.3.4a commit 3 wires
// real outcome / damage / gold / hearts from the resolved CombatResult
// (commit 1's seed-bag/seed-shop dissolution removed the canned demo
// values that previously hardcoded "VICTORY +1 +18 3/3").

import { CoinGlyph } from '../icons/icons';

interface RoundResolutionProps {
  round: number;
  outcome: 'win' | 'loss';
  damageDealt: number;
  damageTaken: number;
  goldEarned: number;
  trophyEarned: number;
  hearts: number;
  maxHearts: number;
  onNext: () => void;
}

export function RoundResolution({
  round,
  outcome,
  damageDealt,
  damageTaken,
  goldEarned,
  trophyEarned,
  hearts,
  maxHearts,
  onNext,
}: RoundResolutionProps) {
  const isWin = outcome === 'win';
  const headerColor = isWin ? 'var(--r-uncommon)' : 'var(--life-stroke)';
  const headerLabel = isWin ? 'VICTORY' : 'DEFEAT';
  const headline = isWin ? 'You crushed the ghost.' : 'The ghost outlasted you.';
  return (
    <div
      className="ease-snap"
      style={{
        width: 360,
        padding: 24,
        background: 'var(--surface-elev)',
        border: `2px solid ${headerColor}`,
        borderRadius: 8,
        textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
      }}
    >
      <div
        className="label-cap"
        style={{ color: headerColor, fontSize: 12, marginBottom: 6 }}
      >
        ROUND {round} — {headerLabel}
      </div>
      <div className="heading-tight" style={{ fontSize: 32, marginBottom: 16 }}>
        {headline}
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
              +{goldEarned}
            </span>
          </div>
        </div>
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            TROPHY
          </div>
          <div className="tnum heading-tight" style={{ fontSize: 22 }}>
            +{trophyEarned}
          </div>
        </div>
        <div>
          <div className="label-cap" style={{ fontSize: 9, color: 'var(--text-secondary)' }}>
            HEARTS
          </div>
          <div
            className="tnum heading-tight"
            style={{
              fontSize: 22,
              color: isWin ? 'var(--life-stroke)' : 'var(--life-stroke)',
            }}
          >
            {hearts}/{maxHearts}
          </div>
        </div>
      </div>
      <div
        className="flex items-center justify-center gap-4"
        style={{
          fontSize: 11,
          color: 'var(--text-secondary)',
          marginBottom: 16,
        }}
      >
        <span className="tnum">
          DEALT <span style={{ color: 'var(--text-primary)' }}>{damageDealt}</span>
        </span>
        <span className="tnum">
          TAKEN <span style={{ color: 'var(--life-stroke)' }}>{damageTaken}</span>
        </span>
      </div>
      <button
        onClick={onNext}
        className="ease-snap hover-lift label-cap"
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 6,
          background: 'var(--accent)',
          color: 'var(--text-primary)',
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
