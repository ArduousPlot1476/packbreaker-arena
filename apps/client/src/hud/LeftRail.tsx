// Left rail: class passive icon + relic slots + opponent intent silhouettes.

import { GhostGlyph, ICONS, RelicLoop, TinkerGlyph } from '../icons/icons';

function OpponentSilhouettes() {
  const Sword = ICONS['iron-sword'];
  const Shield = ICONS['wooden-shield'];
  return (
    <div className="flex gap-2">
      <div
        style={{ width: 32, height: 32, background: 'var(--bg-deep)', borderRadius: 4, padding: 4 }}
      >
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Sword />
        </div>
      </div>
      <div
        style={{ width: 32, height: 32, background: 'var(--bg-deep)', borderRadius: 4, padding: 4 }}
      >
        <div style={{ filter: 'brightness(0) invert(0.6)' }}>
          <Shield />
        </div>
      </div>
    </div>
  );
}

export function LeftRail() {
  return (
    <div
      className="flex flex-col"
      style={{
        width: 180,
        background: 'var(--bg-mid)',
        borderRight: '1px solid var(--border-default)',
        padding: 14,
        gap: 14,
      }}
    >
      <div>
        <div
          className="label-cap"
          style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}
        >
          CLASS
        </div>
        <div
          className="flex items-center gap-2"
          style={{
            background: 'var(--surface)',
            padding: 8,
            borderRadius: 6,
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ width: 26, height: 26 }}>
            <TinkerGlyph />
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Tinker</div>
            <div style={{ fontSize: 9, color: 'var(--text-secondary)', lineHeight: 1.2 }}>
              +10% recipe potency
            </div>
          </div>
        </div>
      </div>

      <div>
        <div
          className="label-cap"
          style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}
        >
          RELICS
        </div>
        <div className="flex flex-col gap-2">
          <div
            className="flex items-center gap-2"
            style={{
              background: 'var(--surface)',
              padding: 8,
              borderRadius: 6,
              border: '1px solid #3B82F6',
            }}
          >
            <div style={{ width: 22, height: 22 }}>
              <RelicLoop />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Apprentice's Loop</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>+1 reroll / round</div>
            </div>
          </div>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                height: 38,
                borderRadius: 6,
                border: '1px dashed var(--border-default)',
                background: 'transparent',
              }}
            >
              <span className="label-cap" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
                EMPTY
              </span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div
          className="label-cap"
          style={{ fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}
        >
          OPPONENT INTENT
        </div>
        <div
          style={{
            background: 'var(--surface)',
            padding: 10,
            borderRadius: 6,
            border: '1px solid var(--border-default)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div style={{ width: 28, height: 28 }}>
              <GhostGlyph />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600 }}>Ghost</div>
              <div style={{ fontSize: 9, color: 'var(--text-secondary)' }}>Round 4 · ±1 trophy</div>
            </div>
          </div>
          <div
            className="label-cap"
            style={{ fontSize: 8, color: 'var(--text-muted)', marginBottom: 4 }}
          >
            SILHOUETTES
          </div>
          <OpponentSilhouettes />
        </div>
      </div>
    </div>
  );
}
