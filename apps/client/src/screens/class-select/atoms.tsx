// Primitives for the M1.5b PR 1 class-select / starter-relic screen.
// Ported byte-for-byte-in-semantics from the Claude Design board source
// (M1.5b PR 1 design board, 2026-05-18). Palette references CSS tokens
// from index.css (visual-direction.md § 3) rather than hex literals so
// any future palette tweak flows through automatically.

import type { CSSProperties, ReactNode } from 'react';
import type { Class, ClassId, Relic } from '@packbreaker/content';

const FONT =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';

// 1.5px-stroke discipline per visual-direction.md § 5 carries across all
// SVGs in this file. Centralized here so the design-board → port has one
// place to audit if the rule ever moves.
const STROKE = 1.5;

/** Hexagonal portrait clip — six-pointed badge per visual ratification
 *  Q3. Matches the board's HEX_CLIP polygon, point-for-point. */
export const HEX_CLIP =
  'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)';

// ────────────────────────────────────────────────────────────────────
// Text atoms — Inter weights per visual-direction.md § 4.
// ────────────────────────────────────────────────────────────────────

export function Label({
  children,
  color,
  style,
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        color: color ?? 'var(--text-muted)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Display({
  children,
  size = 36,
  color,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        lineHeight: 1.1,
        color: color ?? 'var(--text-primary)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Body({
  children,
  size = 14,
  color,
  weight = 500,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  weight?: 400 | 500 | 600 | 700;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: weight,
        lineHeight: 1.5,
        color: color ?? 'var(--text-primary)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Class portraits — vector-flat, 1.5px stroke. Tinker: cog + gem motif.
// Marauder: blade + cross-guard motif. No character art.
// ────────────────────────────────────────────────────────────────────

export function ClassMark({
  kind,
  size = 96,
  accent,
}: {
  kind: ClassId | 'tinker' | 'marauder';
  size?: number;
  accent?: string | null;
}) {
  const stroke = 'var(--text-primary)';
  if (kind === ('tinker' as ClassId)) {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
        <g
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M32 8 L34 12 L38 11 L39 15 L43 16 L42 20 L46 23 L43 26 L45 30 L41 32 L42 36 L38 37 L36 41 L32 39 L28 41 L26 37 L22 36 L23 32 L19 30 L21 26 L18 23 L22 20 L21 16 L25 15 L26 11 L30 12 Z" />
          <path d="M32 19 L40 26 L32 35 L24 26 Z" />
          <path d="M24 26 L40 26" />
          <path d="M32 19 L28 26 L32 35" />
          <path d="M32 19 L36 26 L32 35" />
        </g>
        {accent && <circle cx="32" cy="26" r="1.6" fill={accent} />}
        <g
          stroke={stroke}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 46 L42 46" />
          <path d="M26 46 L26 52" />
          <path d="M32 46 L32 54" />
          <path d="M38 46 L38 52" />
        </g>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <g
        stroke={stroke}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M32 7 L38 18 L38 40 L32 46 L26 40 L26 18 Z" />
        <path d="M32 7 L32 46" />
        <path d="M18 40 L46 40" />
        <path d="M20 40 L20 44 L24 44" />
        <path d="M44 40 L44 44 L40 44" />
        <path d="M30 44 L30 54 L34 54 L34 44" />
        <path d="M28 54 L36 54 L34 58 L30 58 Z" />
      </g>
      {accent && <circle cx="32" cy="40" r="1.8" fill={accent} />}
    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────
// Relic glyphs — 6 starter relics, geometric placeholders per
// visual-direction.md § 5. Inline SVG (no asset pipeline at 5b.1).
// ────────────────────────────────────────────────────────────────────

export function RelicGlyph({ id, size = 40 }: { id: string; size?: number }) {
  const common = {
    stroke: 'var(--text-primary)',
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none' as const,
  };
  switch (id) {
    case 'apprentices-loop':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40">
          <g {...common}>
            <circle cx="20" cy="20" r="11" />
            <path d="M20 9 A11 11 0 0 1 31 20" strokeDasharray="2 3" />
            <path d="M28 7 L31 9 L29 12" />
          </g>
        </svg>
      );
    case 'pocket-forge':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40">
          <g {...common}>
            <path d="M8 30 L32 30 L29 18 L11 18 Z" />
            <path d="M14 18 L14 12 L26 12 L26 18" />
            <path d="M16 24 L24 24" />
          </g>
        </svg>
      );
    case 'merchants-mark':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40">
          <g {...common}>
            <circle cx="20" cy="20" r="10" />
            <path d="M16 16 C16 13, 24 13, 24 16 C24 19, 16 19, 16 22 C16 25, 24 25, 24 22" />
            <path d="M20 11 L20 14" />
            <path d="M20 26 L20 29" />
          </g>
        </svg>
      );
    case 'razors-edge':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40">
          <g {...common}>
            <path d="M10 30 L30 10" />
            <path d="M10 30 L13 27 L16 30 L13 33 Z" />
            <path d="M26 6 L34 14" />
          </g>
        </svg>
      );
    case 'bloodfont':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40">
          <g {...common}>
            <path d="M20 8 C14 18, 11 22, 11 27 A9 9 0 0 0 29 27 C29 22, 26 18, 20 8 Z" />
            <path d="M16 26 A4 4 0 0 0 20 30" />
          </g>
        </svg>
      );
    case 'iron-will':
      return (
        <svg width={size} height={size} viewBox="0 0 40 40">
          <g {...common}>
            <path d="M20 8 L31 12 L31 22 C31 28, 26 32, 20 34 C14 32, 9 28, 9 22 L9 12 Z" />
            <path d="M16 21 L19 24 L25 17" />
          </g>
        </svg>
      );
    default:
      return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Stepper pip indicator — Step 1 of 2 / Step 2 of 2 affordance per
// design board (active pip = text-primary, inactive = border-default).
// ────────────────────────────────────────────────────────────────────

export function Pips({ stage }: { stage: 1 | 2 }) {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <div
        style={{
          width: 22,
          height: 4,
          borderRadius: 2,
          background: 'var(--text-primary)',
        }}
      />
      <div
        style={{
          width: 22,
          height: 4,
          borderRadius: 2,
          background: stage === 2 ? 'var(--text-primary)' : 'var(--border-default)',
        }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Begin Run CTA — disabled state matches surface-elev + text-muted per
// design board. Enabled state uses accent fill + text-primary label.
// ────────────────────────────────────────────────────────────────────

export function BeginRunBtn({
  enabled,
  onClick,
  width,
  testId,
}: {
  enabled: boolean;
  onClick?: () => void;
  width?: string | number;
  testId?: string;
}) {
  const bg = enabled ? 'var(--accent)' : 'var(--surface-elev)';
  const fg = enabled ? 'var(--text-primary)' : 'var(--text-muted)';
  const border = enabled ? 'transparent' : 'var(--border-default)';
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      data-testid={testId}
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '14px 28px',
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: 600,
        letterSpacing: '-0.005em',
        cursor: enabled ? 'pointer' : 'not-allowed',
        width: width ?? 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'center',
      }}
    >
      Begin Run
      <span style={{ opacity: 0.75, fontSize: 13 }}>→</span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Panel shell — bg-deep with subtle radial bg-mid vignette per Q2
// ratification. No tile pattern, no decorative chrome.
// ────────────────────────────────────────────────────────────────────

export function PanelShell({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        background: 'var(--bg-deep)',
        backgroundImage:
          'radial-gradient(ellipse 80% 60% at 50% 45%, var(--bg-mid) 0%, var(--bg-deep) 70%)',
        color: 'var(--text-primary)',
        fontFamily: FONT,
        position: 'relative',
        overflow: 'hidden',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Class card — used in stage 1 (idle, lg) and stage 2 desktop
// (selected, lg + dim, sm for OR-SWITCH). Selected state lifts 2px +
// adds accent ring + soft glow + ✓ badge.
// ────────────────────────────────────────────────────────────────────

export type ClassCardState = 'idle' | 'selected' | 'dim';
export type ClassCardSize = 'lg' | 'sm';

export function ClassCard({
  klass,
  state = 'idle',
  size = 'lg',
  onClick,
  testId,
}: {
  klass: Class;
  state?: ClassCardState;
  size?: ClassCardSize;
  onClick?: () => void;
  testId?: string;
}) {
  const selected = state === 'selected';
  const dim = state === 'dim';
  const border = selected ? 'var(--accent)' : 'var(--border-default)';
  const ringShadow = selected
    ? '0 0 0 1px var(--bg-deep), 0 0 0 2px var(--accent), 0 0 36px -4px rgba(59, 130, 246, 0.33)'
    : 'none';

  const pad = size === 'lg' ? 28 : 18;
  const portraitSize = size === 'lg' ? 132 : 84;
  const nameSize = size === 'lg' ? 28 : 20;
  const opacity = dim ? 0.42 : 1;

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={selected}
      style={{
        background: 'var(--surface)',
        borderRadius: 10,
        border: `1px solid ${border}`,
        boxShadow: ringShadow,
        padding: pad,
        opacity,
        transform: selected ? 'translateY(-2px)' : 'none',
        filter: dim ? 'saturate(0.6)' : 'none',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: size === 'lg' ? 18 : 12,
        transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        textAlign: 'left',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: FONT,
        color: 'var(--text-primary)',
        width: '100%',
      }}
    >
      <div
        style={{
          width: portraitSize,
          height: portraitSize,
          clipPath: HEX_CLIP,
          background: 'var(--bg-mid)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 4,
            clipPath: HEX_CLIP,
            background: 'var(--surface-elev)',
          }}
        />
        <div style={{ position: 'relative' }}>
          <ClassMark
            kind={klass.id}
            size={Math.round(portraitSize * 0.62)}
            accent={selected ? 'var(--accent)' : null}
          />
        </div>
      </div>

      <Display size={nameSize}>{klass.displayName}</Display>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {klass.affinityTags.map((tag) => (
          <span
            key={tag}
            style={{
              fontFamily: FONT,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border-default)',
              borderRadius: 4,
              padding: '4px 8px',
              background: 'var(--bg-mid)',
            }}
          >
            {tag}
          </span>
        ))}
      </div>

      {size === 'lg' && (
        <div style={{ marginTop: 4 }}>
          <Label style={{ marginBottom: 8 }}>Passive</Label>
          <Body size={14} weight={500} color="var(--text-primary)">
            <span className="tnum">{klass.passive.description}</span>
          </Body>
        </div>
      )}

      {size === 'sm' && (
        <Body size={12} weight={500} color="var(--text-secondary)" style={{ marginTop: -4 }}>
          <span className="tnum">{klass.passive.description}</span>
        </Body>
      )}

      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: 'var(--accent)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}
          aria-hidden
        >
          ✓
        </div>
      )}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────
// Relic card — `col` for desktop stage 2 (3-column grid), `row` for
// mobile stage 2 (3 stacked full-width rows). Relic cards are
// distinct from item cards: no rarity color, no corner gem, no border
// rarity encoding (visual ratification).
// ────────────────────────────────────────────────────────────────────

export type RelicCardLayout = 'col' | 'row';

export function RelicCard({
  relic,
  selected,
  layout = 'col',
  onClick,
  testId,
}: {
  relic: Relic;
  selected: boolean;
  layout?: RelicCardLayout;
  onClick?: () => void;
  testId?: string;
}) {
  const border = selected ? 'var(--accent)' : 'var(--border-default)';
  const ringShadow = selected
    ? '0 0 0 1px var(--bg-deep), 0 0 0 2px var(--accent), 0 0 30px -6px rgba(59, 130, 246, 0.4)'
    : 'none';

  const commonStyles: CSSProperties = {
    background: 'var(--surface)',
    border: `1px solid ${border}`,
    boxShadow: ringShadow,
    position: 'relative',
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    transform: selected ? 'translateY(-2px)' : 'none',
    cursor: onClick ? 'pointer' : 'default',
    textAlign: 'left' as const,
    fontFamily: FONT,
    color: 'var(--text-primary)',
  };

  if (layout === 'row') {
    return (
      <button
        type="button"
        onClick={onClick}
        data-testid={testId}
        aria-pressed={selected}
        style={{
          ...commonStyles,
          width: '100%',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          gap: 14,
          alignItems: 'flex-start',
          transform: selected ? 'translateY(-1px)' : 'none',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            flexShrink: 0,
            background: 'var(--bg-mid)',
            borderRadius: 6,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid var(--border-default)',
          }}
        >
          <RelicGlyph id={String(relic.id)} size={32} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Body size={14} weight={600} color="var(--text-primary)" style={{ marginBottom: 4 }}>
            {relic.name}
          </Body>
          <Body size={12} weight={500} color="var(--text-secondary)">
            <span className="tnum">{relic.description}</span>
          </Body>
        </div>
        {selected && (
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 999,
              background: 'var(--accent)',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}
            aria-hidden
          >
            ✓
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-pressed={selected}
      style={{
        ...commonStyles,
        width: '100%',
        borderRadius: 10,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          background: 'var(--bg-mid)',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--border-default)',
        }}
      >
        <RelicGlyph id={String(relic.id)} size={36} />
      </div>
      <Body size={16} weight={600} color="var(--text-primary)">
        {relic.name}
      </Body>
      <Body size={13} weight={500} color="var(--text-secondary)">
        <span className="tnum">{relic.description}</span>
      </Body>
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 22,
            height: 22,
            borderRadius: 999,
            background: 'var(--accent)',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
          }}
          aria-hidden
        >
          ✓
        </div>
      )}
    </button>
  );
}
