// Mobile [Relics] tab content per Trey's decision-2 ratification:
// class passive header card + 3 relic slots. Mirrors the desktop
// LeftRail's CLASS + RELICS blocks (less the OPPONENT INTENT block,
// which moved to the top bar per decision-1).

import type { RunState } from '../../../data.local';
import { RelicLoop, TinkerGlyph } from '../../../icons/icons';

interface RelicsTabProps {
  state: RunState;
}

export function RelicsTab({ state }: RelicsTabProps) {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        padding: 12,
        overflow: 'auto',
        background: 'var(--bg-deep)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div>
        <div
          className="label-cap"
          style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}
        >
          CLASS
        </div>
        <div
          className="flex items-center gap-3"
          style={{
            background: 'var(--surface)',
            padding: 12,
            borderRadius: 6,
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ width: 30, height: 30 }}>
            <TinkerGlyph />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {state.className}
            </div>
            <div
              style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.3 }}
            >
              +10% recipe potency
            </div>
          </div>
        </div>
      </div>

      <div>
        <div
          className="label-cap"
          style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}
        >
          RELICS
        </div>
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center gap-3"
            style={{
              background: 'var(--surface)',
              padding: 10,
              borderRadius: 6,
              border: '1px solid var(--accent)',
            }}
          >
            <div style={{ width: 26, height: 26 }}>
              <RelicLoop />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                Apprentice's Loop
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>+1 reroll / round</div>
            </div>
          </div>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                minHeight: 48,
                borderRadius: 6,
                border: '1px dashed var(--border-default)',
                background: 'transparent',
              }}
            >
              <span className="label-cap" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                EMPTY
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
