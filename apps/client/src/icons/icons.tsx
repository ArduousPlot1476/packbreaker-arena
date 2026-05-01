// Icons — vector-flat, 64×64 source, 1.5px stroke, gridline aesthetic.
// Each icon is rendered to fill its parent (via viewBox 0 0 64 64).
// Body fill carries identity; rarity is on the frame, not the icon.
//
// Body-color rule audit (M1.3.2 commit 5, per visual-direction.md § 5
// + decision-log.md 2026-04-26 Option A: "identity/tag colors (plant,
// fire, food, blood, gold) override the rarity-collision rule"):
//
//   item            rarity      body palette                     pass-reason
//   --------------  ----------  -------------------------------  ----------------------------
//   iron-sword      common      slate gradient (CBD5E1→64748B)   iron material = rarity-common
//   iron-dagger     common      slate (CBD5E1) + brown handle    same as iron-sword
//   wooden-shield   common      brown (92400E, 7C2D12)           wood material identity
//   healing-herb    common      leaf-green (86EFAC, 16A34A);     plant identity (Option A)
//                               not equal to rarity-uncommon
//                               22C55E
//   spark-stone     common      amber spark (F59E0B, FCD34D)     fire identity (Option A);
//                               on dark stone                    F59E0B coincides w/ legendary
//                                                                frame, identity rule overrides
//   whetstone       common      slate gradient (94A3B8, CBD5E1)  stone/metal material identity
//   apple           common      red body (DC2626) + leaf         food identity (Option A)
//   copper-coin     common      gold (F59E0B, FCD34D)            gold currency identity (Opt A)
//                                                                — coin-glyph never appears
//                                                                inside Legendary item frame
//                                                                per § 3, no surface collision
//   steel-sword     uncommon    silver gradient (E2E8F0→94A3B8)  metal material identity
//                                                                94A3B8 stop = rarity-common
//                                                                but is metallic base
//   healing-salve   uncommon    bottle-green (16A34A)            plant identity matches rarity
//   ember-brand     rare        ember gradient + flames          fire identity (Option A)
//   fire-oil        uncommon    dark + amber flame (F59E0B)      fire identity (Option A)
//
// Pass: all 12 items. No body fill collides with a non-own,
// non-identity-exempted rarity color. Frame border + corner gem
// (dual-coded rarity carriers per § 1) remain the rarity-language
// authority on each surface.

import type { ReactNode, SVGProps } from 'react';
import type { ItemId } from '../data.local';

type StrokeyProps = { children: ReactNode } & Omit<SVGProps<SVGSVGElement>, 'children'>;

const Strokey = ({ children, ...rest }: StrokeyProps) => (
  <svg
    viewBox="0 0 64 64"
    width="100%"
    height="100%"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...rest}
  >
    {children}
  </svg>
);

// ---------- Anchor icons ----------

const IronSword = () => (
  <Strokey>
    <defs>
      <linearGradient id="bladeGrad" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stopColor="#CBD5E1" />
        <stop offset="1" stopColor="#64748B" />
      </linearGradient>
    </defs>
    <path d="M32 6 L36 16 L36 60 L28 60 L28 16 Z" fill="url(#bladeGrad)" stroke="#1C2333" strokeWidth="1.5" />
    <line x1="32" y1="14" x2="32" y2="58" stroke="#1C2333" strokeWidth="1.5" opacity="0.5" />
    <rect x="14" y="60" width="36" height="6" rx="1.5" fill="#475569" stroke="#1C2333" strokeWidth="1.5" transform="translate(0,-2)" />
    <rect x="29" y="64" width="6" height="14" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.5" transform="translate(0,-12)" />
    <circle cx="32" cy="68" r="3.5" fill="#94A3B8" stroke="#1C2333" strokeWidth="1.5" transform="translate(0,-8)" />
  </Strokey>
);

const HealingHerb = () => (
  <Strokey>
    <defs>
      <linearGradient id="leafGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#86EFAC" />
        <stop offset="1" stopColor="#16A34A" />
      </linearGradient>
    </defs>
    <path d="M32 56 L32 32" stroke="#15803D" strokeWidth="2.5" />
    <path d="M32 32 C24 22, 24 12, 32 8 C40 12, 40 22, 32 32 Z" fill="url(#leafGrad)" stroke="#14532D" strokeWidth="1.5" />
    <line x1="32" y1="10" x2="32" y2="30" stroke="#14532D" strokeWidth="1.5" opacity="0.6" />
    <path d="M22 36 C12 32, 8 24, 14 18 C22 18, 26 26, 22 36 Z" fill="url(#leafGrad)" stroke="#14532D" strokeWidth="1.5" />
    <path d="M42 36 C52 32, 56 24, 50 18 C42 18, 38 26, 42 36 Z" fill="url(#leafGrad)" stroke="#14532D" strokeWidth="1.5" />
  </Strokey>
);

const EmberBrand = () => (
  <Strokey>
    <defs>
      <linearGradient id="emberBlade" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#7C2D12" />
        <stop offset="1" stopColor="#CBD5E1" />
      </linearGradient>
      <linearGradient id="flameGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#FCD34D" />
        <stop offset="1" stopColor="#DC2626" />
      </linearGradient>
    </defs>
    <rect x="3" y="28" width="10" height="8" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="13" y="24" width="5" height="16" fill="#475569" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="6" cy="32" r="2.5" fill="#94A3B8" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M18 28 L52 28 L60 32 L52 36 L18 36 Z" fill="url(#emberBlade)" stroke="#1C2333" strokeWidth="1.5" />
    <line x1="20" y1="32" x2="56" y2="32" stroke="#1C2333" strokeWidth="1" opacity="0.5" />
    <path d="M44 28 C46 22, 50 22, 50 18 C53 22, 53 26, 50 28 Z" fill="url(#flameGrad)" stroke="#7C2D12" strokeWidth="1.2" />
    <path d="M50 36 C52 40, 48 42, 50 46 C46 44, 45 40, 47 36 Z" fill="url(#flameGrad)" stroke="#7C2D12" strokeWidth="1.2" />
  </Strokey>
);

// ---------- Secondary placeholders ----------

const IronDagger = () => (
  <Strokey>
    <path d="M32 8 L36 22 L36 44 L28 44 L28 22 Z" fill="#CBD5E1" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="18" y="44" width="28" height="5" fill="#475569" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="29" y="49" width="6" height="9" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="32" cy="60" r="3" fill="#94A3B8" stroke="#1C2333" strokeWidth="1.5" />
  </Strokey>
);

const WoodenShield = () => (
  <Strokey>
    <path d="M32 8 L52 16 L48 44 L32 56 L16 44 L12 16 Z" fill="#92400E" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M32 14 L46 20 L43 40 L32 50 L21 40 L18 20 Z" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.2" opacity="0.85" />
    <line x1="32" y1="14" x2="32" y2="50" stroke="#451A03" strokeWidth="1.5" />
    <line x1="22" y1="32" x2="42" y2="32" stroke="#451A03" strokeWidth="1.5" />
  </Strokey>
);

const Apple = () => (
  <Strokey>
    <path d="M32 18 C18 18, 12 30, 16 44 C20 56, 30 58, 32 56 C34 58, 44 56, 48 44 C52 30, 46 18, 32 18 Z" fill="#DC2626" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M32 18 C32 14, 36 10, 40 10" stroke="#15803D" strokeWidth="2.5" fill="none" />
    <path d="M40 10 C44 8, 48 12, 46 16 Z" fill="#16A34A" stroke="#14532D" strokeWidth="1.2" />
    <ellipse cx="24" cy="28" rx="3" ry="4" fill="#FCA5A5" opacity="0.7" />
  </Strokey>
);

const SparkStone = () => (
  <Strokey>
    <path d="M20 14 L44 14 L52 28 L44 50 L20 50 L12 28 Z" fill="#1E293B" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M20 14 L44 14 L48 24 L20 24 Z" fill="#334155" stroke="#1C2333" strokeWidth="1.2" />
    <path d="M32 22 L34 30 L42 32 L34 34 L32 42 L30 34 L22 32 L30 30 Z" fill="#FCD34D" stroke="#F59E0B" strokeWidth="1.2" />
  </Strokey>
);

const CopperCoin = () => (
  <Strokey>
    <circle cx="32" cy="32" r="22" fill="#F59E0B" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="32" cy="32" r="17" fill="#FCD34D" stroke="#92400E" strokeWidth="1.2" />
    <text x="32" y="40" textAnchor="middle" fontFamily="Inter" fontWeight="700" fontSize="20" fill="#7C2D12">¢</text>
  </Strokey>
);

const Whetstone = () => (
  <Strokey>
    <path d="M14 28 L50 22 L52 38 L16 44 Z" fill="#94A3B8" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M14 28 L50 22 L46 30 L16 36 Z" fill="#CBD5E1" stroke="#1C2333" strokeWidth="1" opacity="0.8" />
    <line x1="20" y1="36" x2="46" y2="32" stroke="#475569" strokeWidth="1.2" />
  </Strokey>
);

const SteelSword = () => (
  <Strokey>
    <defs>
      <linearGradient id="steelGrad" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stopColor="#E2E8F0" />
        <stop offset="0.5" stopColor="#F8FAFC" />
        <stop offset="1" stopColor="#94A3B8" />
      </linearGradient>
    </defs>
    <path d="M32 4 L37 14 L37 56 L27 56 L27 14 Z" fill="url(#steelGrad)" stroke="#1C2333" strokeWidth="1.5" />
    <line x1="32" y1="12" x2="32" y2="54" stroke="#1C2333" strokeWidth="1" opacity="0.55" />
    <rect x="12" y="56" width="40" height="6" rx="1.5" fill="#64748B" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="28" y="62" width="8" height="2" fill="#475569" />
  </Strokey>
);

const HealingSalve = () => (
  <Strokey>
    <rect x="20" y="22" width="24" height="32" rx="3" fill="#16A34A" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="22" y="14" width="20" height="8" rx="1.5" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="24" y="28" width="16" height="22" rx="2" fill="#86EFAC" stroke="#14532D" strokeWidth="1.2" />
    <path d="M32 32 L32 44 M26 38 L38 38" stroke="#16A34A" strokeWidth="2.5" />
  </Strokey>
);

const FireOil = () => (
  <Strokey>
    <path d="M22 16 L42 16 L42 22 L36 28 L36 56 L28 56 L28 28 L22 22 Z" fill="#1E293B" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M28 30 L36 30 L36 54 L28 54 Z" fill="#F59E0B" stroke="#7C2D12" strokeWidth="1.2" />
    <path d="M30 38 C30 34, 34 34, 32 30 C36 34, 36 40, 32 42 Z" fill="#FCD34D" stroke="#7C2D12" strokeWidth="1" />
  </Strokey>
);

export const ICONS: Record<ItemId, () => JSX.Element> = {
  'iron-sword': IronSword,
  'iron-dagger': IronDagger,
  'wooden-shield': WoodenShield,
  'healing-herb': HealingHerb,
  'spark-stone': SparkStone,
  'whetstone': Whetstone,
  'apple': Apple,
  'copper-coin': CopperCoin,
  'steel-sword': SteelSword,
  'healing-salve': HealingSalve,
  'ember-brand': EmberBrand,
  'fire-oil': FireOil,
};

// HUD glyphs

export const HeartGlyph = ({ filled = true }: { filled?: boolean }) => (
  <svg viewBox="0 0 24 24" width="100%" height="100%">
    <path
      d="M12 21 C5 16 2 12 2 8 C2 5 4.5 3 7.5 3 C9.5 3 11 4 12 5.5 C13 4 14.5 3 16.5 3 C19.5 3 22 5 22 8 C22 12 19 16 12 21 Z"
      fill={filled ? '#EF4444' : 'transparent'}
      stroke="#F87171"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export const CoinGlyph = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%">
    <circle cx="12" cy="12" r="9" fill="#F59E0B" stroke="#FCD34D" strokeWidth="1.5" />
    <text x="12" y="16" textAnchor="middle" fontFamily="Inter" fontSize="11" fontWeight="700" fill="#7C2D12">G</text>
  </svg>
);

export const TinkerGlyph = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3.2" stroke="#94A3B8" strokeWidth="1.5" />
    <path
      d="M12 4 L13 7 L11 7 Z M12 20 L11 17 L13 17 Z M4 12 L7 11 L7 13 Z M20 12 L17 13 L17 11 Z
         M6.5 6.5 L9 8 L8 9 Z M17.5 17.5 L15 16 L16 15 Z M17.5 6.5 L16 9 L15 8 Z M6.5 17.5 L8 15 L9 16 Z"
      fill="#94A3B8"
      stroke="#94A3B8"
      strokeWidth="1"
    />
  </svg>
);

export const RelicLoop = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="7" stroke="#3B82F6" strokeWidth="1.8" strokeDasharray="3 3" />
    <path d="M16 8 L19 8 L19 11" stroke="#3B82F6" strokeWidth="1.8" />
    <path d="M19 8 C17.5 5.5, 14 4, 11 5" stroke="#3B82F6" strokeWidth="1.8" fill="none" />
  </svg>
);

export const GhostGlyph = () => (
  <svg viewBox="0 0 32 32" width="100%" height="100%" fill="none" strokeLinejoin="round">
    <path
      d="M6 14 C6 8, 10 4, 16 4 C22 4, 26 8, 26 14 L26 28 L23 25 L20 28 L16 25 L12 28 L9 25 L6 28 Z"
      fill="#1C2333"
      stroke="#94A3B8"
      strokeWidth="1.5"
    />
    <circle cx="13" cy="13" r="1.5" fill="#94A3B8" />
    <circle cx="19" cy="13" r="1.5" fill="#94A3B8" />
  </svg>
);

export const BurnGlyph = () => (
  <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none">
    <path
      d="M12 3 C13 7, 17 8, 17 13 C17 17, 14 20, 12 20 C10 20, 7 17, 7 13 C7 9, 10 9, 11 6 C11.4 4.5, 12 4, 12 3 Z"
      fill="#F59E0B"
      stroke="#7C2D12"
      strokeWidth="1.5"
    />
    <path
      d="M12 11 C12.5 13, 14 13.5, 14 16 C14 17.5, 13 18.5, 12 18.5 C11 18.5, 10 17.5, 10 16 C10 14, 11.5 13.5, 12 11 Z"
      fill="#FCD34D"
      stroke="#7C2D12"
      strokeWidth="1"
    />
  </svg>
);
