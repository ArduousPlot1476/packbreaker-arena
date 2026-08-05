// Title screen — gdd.md § 14.1, screen 1 of the inventory, and the last one
// still unbuilt (CF 69).
//
// Until now main.tsx rendered <RunScreen/> directly, so the app opened straight
// into class select: no name, no way back, no settings, and no way to tell an
// in-progress run from a fresh one. Fine for a developer with the tab already
// open; wrong for a link you send someone.
//
// The gdd lists four entries: New Run / Continue / Daily / Settings. Three are
// live. Daily renders as a disabled affordance rather than being hidden —
// hiding it would make the eventual arrival feel like a bolt-on, and an
// explicitly "not yet" control tells a player the game has a shape.

import { useMemo, useState } from 'react';
import { cssVar, rgba } from '@packbreaker/ui-kit';
import { loadLocal } from '../persistence';
import { SettingsPanel } from './SettingsPanel';

export interface TitleScreenProps {
  /** Start at class select, discarding any saved run. */
  readonly onNewRun: () => void;
  /** Resume the saved in-progress run. Only offered when one exists. */
  readonly onContinue: () => void;
}

/** Build stamp. Vite substitutes `define` at BUILD time only, so under
 *  `vite dev` the global is undefined — guard rather than crash the title
 *  screen, which is the first thing anyone sees. */
function clientVersion(): string {
  try {
    return typeof __CLIENT_VERSION__ === 'string' ? __CLIENT_VERSION__ : 'dev';
  } catch {
    return 'dev';
  }
}

export function TitleScreen({ onNewRun, onContinue }: TitleScreenProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Read once at mount. The saved run cannot change while this screen is up —
  // nothing here writes to storage, and re-reading on every render would make
  // the CTA flicker.
  const savedRun = useMemo(() => {
    try {
      return loadLocal()?.inProgressRun ?? null;
    } catch {
      // A corrupt save must not block the title screen. New Run still works,
      // and the error boundary's discard path handles the rest.
      return null;
    }
  }, []);

  const hasRun = savedRun !== null;
  const resumeRound = savedRun?.currentRound ?? null;

  return (
    <div
      data-testid="title-screen"
      style={{
        minHeight: '100vh',
        background: cssVar('bgDeep'),
        color: cssVar('textPrimary'),
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <TitleBackdrop />
      {/* Radial vignette between the grid and the menu. Without it the grid
          lines run straight through the tagline and the button labels, and the
          composition reads as noise rather than as depth. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: `radial-gradient(ellipse 42% 52% at 50% 50%, ${cssVar('bgDeep')} 42%, ${rgba('bgDeep', 0.86)} 62%, ${rgba('bgDeep', 0)} 100%)`,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          maxWidth: 420,
        }}
      >
        {/* Wordmark order matches the in-run TopBar ("PACKBREAKER · ARENA"):
            the product name is the dominant word. An earlier pass had ARENA
            large with PACKBREAKER as a small eyebrow, which inverted the
            brand — it read as a game called "Arena". */}
        <h1
          className="heading-tight"
          style={{
            fontSize: 54,
            fontWeight: 800,
            margin: 0,
            letterSpacing: '-0.02em',
            lineHeight: 1,
          }}
        >
          Packbreaker
        </h1>
        <div
          className="label-cap"
          style={{
            fontSize: 15,
            letterSpacing: '0.52em',
            // Optical centring: letter-spacing adds trailing space after the
            // last glyph, which pushes a centred line visibly left.
            textIndent: '0.52em',
            color: cssVar('accent'),
            marginTop: 10,
          }}
        >
          Arena
        </div>
        <p
          style={{
            margin: '20px 0 36px',
            color: cssVar('textSecondary'),
            fontSize: 15,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Build a bag. Arrange it for synergy. Watch it fight.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
          {/* Continue is primary WHEN a run exists — the player's live run is
              the thing they came back for. Otherwise New Run takes the accent. */}
          {hasRun && (
            <MenuButton
              testId="title-continue"
              variant="primary"
              onClick={onContinue}
              label="Continue"
              sub={resumeRound === null ? undefined : `Round ${resumeRound}`}
            />
          )}
          <MenuButton
            testId="title-new-run"
            variant={hasRun ? 'secondary' : 'primary'}
            onClick={onNewRun}
            label="New Run"
            sub={hasRun ? 'Abandons the saved run' : undefined}
          />
          <MenuButton
            testId="title-daily"
            variant="disabled"
            label="Daily Contract"
            sub="Not yet"
          />
          <MenuButton
            testId="title-settings"
            variant="secondary"
            onClick={() => setSettingsOpen(true)}
            label="Settings"
          />
        </div>

        <div
          className="tnum"
          style={{ marginTop: 36, fontSize: 11, color: cssVar('textMuted'), letterSpacing: '0.06em' }}
          data-testid="title-version"
        >
          {clientVersion()}
        </div>
      </div>

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

function MenuButton({
  testId,
  label,
  sub,
  variant,
  onClick,
}: {
  testId: string;
  label: string;
  sub?: string;
  variant: 'primary' | 'secondary' | 'disabled';
  onClick?: () => void;
}) {
  const disabled = variant === 'disabled';
  const primary = variant === 'primary';
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={disabled ? '' : 'hover-lift focus-ring ease-snap'}
      style={{
        font: 'inherit',
        width: '100%',
        textAlign: 'left',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 12,
        padding: '15px 20px',
        borderRadius: 10,
        cursor: disabled ? 'default' : 'pointer',
        background: primary ? cssVar('accent') : cssVar('surface'),
        color: disabled ? cssVar('textMuted') : cssVar('textPrimary'),
        border: `1px solid ${primary ? 'transparent' : cssVar('borderDefault')}`,
        boxShadow: primary ? `0 6px 20px ${rgba('accent', 0.26)}` : 'none',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: '0.02em' }}>{label}</span>
      {sub !== undefined && (
        <span
          className="label-cap"
          style={{
            fontSize: 10,
            letterSpacing: '0.12em',
            color: primary ? rgba('textPrimary', 0.75) : cssVar('textMuted'),
          }}
        >
          {sub}
        </span>
      )}
    </button>
  );
}

/** A faint 6×4 bag grid behind the menu — the game's own object, at rest.
 *  Purely decorative and aria-hidden. Static: motion on a title screen competes
 *  with the CTA, and visual-direction.md § 7 reserves motion for meaning. */
function TitleBackdrop() {
  const cells = Array.from({ length: 24 }, (_, i) => i);
  const filled = new Set([3, 8, 9, 14, 19]);
  return (
    <div
      aria-hidden
      data-testid="title-backdrop"
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Low enough that the grid reads as texture behind the menu rather than
        // as content competing with it. At 0.22 the cell borders cut visibly
        // through the tagline and the button labels.
        opacity: 0.11,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 104px)',
          gridTemplateRows: 'repeat(4, 104px)',
          gap: 12,
        }}
      >
        {cells.map((i) => (
          <div
            key={i}
            style={{
              borderRadius: 8,
              background: cssVar('bgMid'),
              border: `2px solid ${filled.has(i) ? cssVar('accent') : cssVar('borderDefault')}`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
