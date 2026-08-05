// Settings — gdd.md § 14.1's fourth title-screen entry, previously unbuilt.
//
// Two controls today. Audio (volume + mute) joins them when the audio layer
// lands; the panel is structured so that is an added section, not a rewrite.
//
// Escape closes, the scrim closes, and focus is trapped to the panel — the same
// modal contract AbandonRunMenu already establishes, rather than a second,
// weaker one.

import { useEffect, useRef } from 'react';
import { cssVar, rgba } from '@packbreaker/ui-kit';
import { useSettings } from '../settings/SettingsContext';
import { COMBAT_SPEEDS, prefersReducedMotion } from '../settings/settings';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      data-testid="settings-scrim"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        background: rgba('bgDeep', 0.78),
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={panelRef}
        data-testid="settings-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 420,
          background: cssVar('surfaceElev'),
          border: `1px solid ${cssVar('borderDefault')}`,
          borderRadius: 12,
          boxShadow: `0 20px 60px ${rgba('bgDeep', 0.6)}`,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="heading-tight" style={{ fontSize: 20, fontWeight: 700 }}>
            Settings
          </div>
          <button
            ref={closeRef}
            type="button"
            data-testid="settings-close"
            onClick={onClose}
            className="hover-lift focus-ring ease-snap"
            style={{
              font: 'inherit',
              background: 'transparent',
              border: `1px solid ${cssVar('borderDefault')}`,
              color: cssVar('textSecondary'),
              borderRadius: 8,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Close
          </button>
        </div>

        <Row
          label="Reduced motion"
          hint={
            prefersReducedMotion()
              ? 'Your system asks for reduced motion — on by default.'
              : 'Suppresses non-essential animation.'
          }
        >
          <Toggle
            testId="settings-reduced-motion"
            on={settings.reducedMotion}
            onChange={(v) => update({ reducedMotion: v })}
          />
        </Row>

        <Row label="Combat speed" hint="How fast a fight plays back.">
          <div style={{ display: 'flex', gap: 6 }}>
            {COMBAT_SPEEDS.map((speed) => {
              const active = settings.combatSpeed === speed;
              return (
                <button
                  key={speed}
                  type="button"
                  data-testid={`settings-speed-${speed}`}
                  aria-pressed={active}
                  onClick={() => update({ combatSpeed: speed })}
                  className="hover-lift focus-ring ease-snap tnum"
                  style={{
                    font: 'inherit',
                    fontWeight: 700,
                    fontSize: 13,
                    minWidth: 46,
                    padding: '7px 0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: active ? cssVar('accent') : cssVar('surface'),
                    color: active ? cssVar('textPrimary') : cssVar('textSecondary'),
                    border: `1px solid ${active ? 'transparent' : cssVar('borderDefault')}`,
                  }}
                >
                  {speed}×
                </button>
              );
            })}
          </div>
        </Row>
      </div>
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: cssVar('textMuted'), marginTop: 3, lineHeight: 1.4 }}>
          {hint}
        </div>
      </div>
      <div style={{ flex: '0 0 auto', paddingTop: 2 }}>{children}</div>
    </div>
  );
}

function Toggle({
  testId,
  on,
  onChange,
}: {
  testId: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="focus-ring ease-snap"
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        border: `1px solid ${on ? 'transparent' : cssVar('borderDefault')}`,
        background: on ? cssVar('accent') : cssVar('surface'),
        cursor: 'pointer',
        padding: 0,
        position: 'relative',
        transition: 'background 120ms',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: cssVar('textPrimary'),
          transition: 'left 120ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      />
    </button>
  );
}
