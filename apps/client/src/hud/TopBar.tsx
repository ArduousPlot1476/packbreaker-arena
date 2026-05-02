// Top bar: title + gold + hearts + round/totalRounds + contract objective + trophy.

import type { RunState } from '../run/types';
import { CoinGlyph, HeartGlyph } from '../icons/icons';

export function TopBar({ state }: { state: RunState }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        height: 48,
        padding: '0 20px',
        borderBottom: '1px solid var(--border-default)',
        background: 'var(--bg-mid)',
      }}
    >
      <div className="flex items-center gap-6">
        <div className="heading-tight" style={{ fontSize: 14, letterSpacing: '0.06em' }}>
          PACKBREAKER<span style={{ color: 'var(--text-muted)' }}> · ARENA</span>
        </div>
        <div className="flex items-center gap-2 tnum">
          <div style={{ width: 18, height: 18 }}>
            <CoinGlyph />
          </div>
          <span className="heading-tight" style={{ fontSize: 18, color: 'var(--coin-fill)' }}>
            {state.gold}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: state.maxHearts }).map((_, i) => (
            <div key={i} style={{ width: 18, height: 18 }}>
              <HeartGlyph filled={i < state.hearts} />
            </div>
          ))}
        </div>
        <div className="tnum" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          ROUND <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{state.round}</span>
          <span style={{ color: 'var(--text-muted)' }}> / {state.totalRounds}</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="label-cap" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          CONTRACT
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{state.contractName}</span>
          <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>·</span>
          <span style={{ marginLeft: 8 }}>{state.contractText}</span>
        </span>
        <div
          className="tnum"
          style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 12 }}
        >
          ◆ <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{state.trophy}</span>
        </div>
      </div>
    </div>
  );
}
