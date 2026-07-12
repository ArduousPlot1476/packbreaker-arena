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

// ---------- Common batch 1 (2026-07-11) — 12 net-new placeholders ----------
// Same Gridline bar as the anchors (1.5px stroke, filled body + line accents,
// one-stop gradient depth). mana-potion body = #06B6D4 (arcane-cyan): signal-
// blue would collide with rarity-rare per visual-direction.md § 5; cyan is
// mana's identity color, ratified decision-log.md 2026-07-11 § "Mana Potion
// body color ratified" (Option A tag/identity exemption).

const WoodenClub = () => (
  <Strokey>
    <path d="M30 60 L30 40 C22 38 20 26 24 16 C27 9 37 9 40 16 C44 26 42 38 34 40 L34 60 Z" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M26 18 C28 12 36 12 38 18" stroke="#92400E" strokeWidth="2" fill="none" opacity="0.6" />
    <circle cx="29" cy="24" r="2" fill="#451A03" />
    <circle cx="35" cy="30" r="2" fill="#451A03" />
    <circle cx="28" cy="32" r="1.6" fill="#451A03" />
  </Strokey>
);

const HandAxe = () => (
  <Strokey>
    <defs>
      <linearGradient id="axeGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#CBD5E1" />
        <stop offset="1" stopColor="#64748B" />
      </linearGradient>
    </defs>
    <path d="M22 58 L41 16" stroke="#7C2D12" strokeWidth="5" strokeLinecap="round" />
    <path d="M34 9 C50 8 59 20 53 33 C44 33 36 28 32 19 Z" fill="url(#axeGrad)" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M38 13 C47 13 53 20 51 29" stroke="#94A3B8" strokeWidth="1.2" fill="none" opacity="0.7" />
    <circle cx="22" cy="58" r="2.6" fill="#475569" stroke="#1C2333" strokeWidth="1.2" />
  </Strokey>
);

const IronMace = () => (
  <Strokey>
    <defs>
      <linearGradient id="maceGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#CBD5E1" />
        <stop offset="1" stopColor="#475569" />
      </linearGradient>
    </defs>
    <rect x="5" y="30" width="34" height="4.5" rx="2.2" fill="#475569" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="6" cy="32.2" r="3" fill="#94A3B8" stroke="#1C2333" strokeWidth="1.5" />
    <g fill="#94A3B8" stroke="#1C2333" strokeWidth="1">
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(0 44 32)" />
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(45 44 32)" />
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(90 44 32)" />
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(135 44 32)" />
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(180 44 32)" />
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(225 44 32)" />
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(270 44 32)" />
      <path d="M41 22 L44 10 L47 22 Z" transform="rotate(315 44 32)" />
    </g>
    <circle cx="44" cy="32" r="12" fill="url(#maceGrad)" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="39.5" cy="27.5" r="3" fill="#CBD5E1" opacity="0.6" />
  </Strokey>
);

const ThrowingKnife = () => (
  <Strokey>
    <defs>
      <linearGradient id="tkGrad" x1="0" y1="1" x2="1" y2="0">
        <stop offset="0" stopColor="#64748B" />
        <stop offset="1" stopColor="#E2E8F0" />
      </linearGradient>
    </defs>
    <circle cx="15" cy="49" r="5" fill="none" stroke="#475569" strokeWidth="3" />
    <path d="M19 45 L27 37" stroke="#475569" strokeWidth="5" strokeLinecap="round" />
    <path d="M25.5 35.5 L30.5 40.5 L53 13 Z" fill="url(#tkGrad)" stroke="#1C2333" strokeWidth="1.5" />
    <line x1="28" y1="38" x2="49" y2="17" stroke="#CBD5E1" strokeWidth="1" opacity="0.6" />
  </Strokey>
);

const Buckler = () => (
  <Strokey>
    <defs>
      <linearGradient id="buckGrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#94A3B8" />
        <stop offset="1" stopColor="#475569" />
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="20" fill="url(#buckGrad)" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="32" cy="32" r="14" fill="none" stroke="#334155" strokeWidth="1.2" opacity="0.8" />
    <g fill="#CBD5E1" stroke="#1C2333" strokeWidth="1">
      <circle cx="32" cy="13" r="2.2" transform="rotate(0 32 32)" />
      <circle cx="32" cy="13" r="2.2" transform="rotate(45 32 32)" />
      <circle cx="32" cy="13" r="2.2" transform="rotate(90 32 32)" />
      <circle cx="32" cy="13" r="2.2" transform="rotate(135 32 32)" />
      <circle cx="32" cy="13" r="2.2" transform="rotate(180 32 32)" />
      <circle cx="32" cy="13" r="2.2" transform="rotate(225 32 32)" />
      <circle cx="32" cy="13" r="2.2" transform="rotate(270 32 32)" />
      <circle cx="32" cy="13" r="2.2" transform="rotate(315 32 32)" />
    </g>
    <circle cx="32" cy="32" r="6" fill="#CBD5E1" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="30" cy="30" r="2" fill="#F0F4FA" opacity="0.5" />
  </Strokey>
);

const LeatherVest = () => (
  <Strokey>
    <path d="M18 14 L28 16 L32 24 L36 16 L46 14 L50 22 L46 26 L46 52 L44 54 L20 54 L18 52 L18 26 L14 22 Z" fill="#92400E" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M20 28 L20 50 L44 50 L44 28 L36 20 L32 26 L28 20 Z" fill="#7C2D12" opacity="0.5" />
    <line x1="32" y1="26" x2="32" y2="50" stroke="#451A03" strokeWidth="1.5" />
    <path d="M28 31 L36 35 M36 31 L28 35 M28 40 L36 44 M36 40 L28 44" stroke="#451A03" strokeWidth="1.2" />
  </Strokey>
);

const IronCap = () => (
  <Strokey>
    <defs>
      <linearGradient id="capGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#CBD5E1" />
        <stop offset="1" stopColor="#64748B" />
      </linearGradient>
    </defs>
    <path d="M14 41 C14 23 22 14 32 14 C42 14 50 23 50 41 Z" fill="url(#capGrad)" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="9" y="41" width="46" height="6" rx="2.5" fill="#475569" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="32" cy="13" r="3" fill="#CBD5E1" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M22 38 C22 26 26 19 32 18" stroke="#F0F4FA" strokeWidth="2" fill="none" opacity="0.5" />
  </Strokey>
);

const Bread = () => (
  <Strokey>
    <path d="M12 42 C12 27 21 22 32 22 C43 22 52 27 52 42 C52 45 50 47 46 47 L18 47 C14 47 12 45 12 42 Z" fill="#92400E" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M15 39 C18 32 24 29 32 29 C40 29 46 32 49 39" fill="none" stroke="#FCD34D" strokeWidth="2.5" opacity="0.55" strokeLinecap="round" />
    <path d="M23 27 L27 34 M31 25 L35 32 M39 27 L43 34" stroke="#7C2D12" strokeWidth="1.8" strokeLinecap="round" />
  </Strokey>
);

const ManaPotion = () => (
  <Strokey>
    <path d="M27 26 L27 33 C19 37 15 47 21 54 C27 60 37 60 43 54 C49 47 45 37 37 33 L37 26 Z" fill="#334155" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M24 40 C19 45 20 52 25 55 C30 59 38 58 41 53 C44 49 43 43 39 40 Z" fill="#06B6D4" stroke="#1E293B" strokeWidth="1" />
    <rect x="26" y="19" width="12" height="8" rx="1" fill="#334155" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="27" y="12" width="10" height="8" rx="1.5" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M24 43 C22.5 46 22.5 50 24 53" stroke="#CBD5E1" strokeWidth="1.5" fill="none" opacity="0.6" />
    <circle cx="31" cy="49" r="1.6" fill="#CBD5E1" opacity="0.6" />
    <circle cx="35" cy="52" r="1.2" fill="#CBD5E1" opacity="0.5" />
  </Strokey>
);

const CoinPouch = () => (
  <Strokey>
    <path d="M16 40 C16 29 22 25 32 25 C42 25 48 29 48 40 C50 51 43 58 32 58 C21 58 14 51 16 40 Z" fill="#92400E" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M23 27 C23 22 27 19 32 19 C37 19 41 22 41 27 Z" fill="#7C2D12" stroke="#1C2333" strokeWidth="1.5" />
    <path d="M24 25 C27 21 37 21 40 25" stroke="#451A03" strokeWidth="2" fill="none" />
    <circle cx="24" cy="25" r="1.8" fill="#451A03" />
    <circle cx="40" cy="25" r="1.8" fill="#451A03" />
    <circle cx="27" cy="16" r="4.5" fill="#F59E0B" stroke="#7C2D12" strokeWidth="1.2" />
    <circle cx="37" cy="15" r="4.5" fill="#FCD34D" stroke="#7C2D12" strokeWidth="1.2" />
    <circle cx="32" cy="12" r="4" fill="#F59E0B" stroke="#7C2D12" strokeWidth="1.2" />
    <path d="M22 44 C26 48 38 48 42 44" stroke="#451A03" strokeWidth="1.2" fill="none" opacity="0.6" />
  </Strokey>
);

const LuckyPenny = () => (
  <Strokey>
    <circle cx="28" cy="36" r="17" fill="#F59E0B" stroke="#1C2333" strokeWidth="1.5" />
    <circle cx="28" cy="36" r="12.5" fill="#FCD34D" stroke="#92400E" strokeWidth="1.2" />
    <text x="28" y="42" textAnchor="middle" fontFamily="Inter" fontWeight="700" fontSize="15" fill="#7C2D12">1</text>
    <g stroke="#14532D" strokeWidth="1">
      <circle cx="44" cy="18" r="3.6" fill="#16A34A" />
      <circle cx="51" cy="18" r="3.6" fill="#86EFAC" />
      <circle cx="47.5" cy="12.5" r="3.6" fill="#16A34A" />
      <circle cx="47.5" cy="23" r="3.6" fill="#16A34A" />
    </g>
    <path d="M47.5 23 L46 30" stroke="#15803D" strokeWidth="1.6" />
  </Strokey>
);

const Bandage = () => (
  <Strokey>
    <rect x="17" y="20" width="30" height="17" rx="5" fill="#E2E8F0" stroke="#1C2333" strokeWidth="1.5" />
    <line x1="25" y1="20" x2="25" y2="37" stroke="#94A3B8" strokeWidth="1.2" />
    <line x1="32" y1="20" x2="32" y2="37" stroke="#94A3B8" strokeWidth="1.2" />
    <line x1="39" y1="20" x2="39" y2="37" stroke="#94A3B8" strokeWidth="1.2" />
    <path d="M22 37 C20 43 26 47 24 53 L31 53 C32 47 27 43 29 37 Z" fill="#CBD5E1" stroke="#1C2333" strokeWidth="1.5" />
    <rect x="27" y="25" width="10" height="7" rx="1.5" fill="#DC2626" opacity="0.9" />
    <path d="M32 26.5 L32 30.5 M30 28.5 L34 28.5" stroke="#F0F4FA" strokeWidth="1.3" />
  </Strokey>
);

// ---------- Uncommon batch 2 (2026-07-11) — 9 net-new placeholders ----------
// Body-color rule audit — batch 2 (same convention as the M1.3.2 table at the
// top of this file; visual-direction.md § 5 + decision-log.md 2026-04-26
// Option A identity/tag exemption). Two body colors were ratified by master-dev,
// superseding the Design artifact's placeholders — decision-log.md 2026-07-11
// § "Batch 2 (Uncommon) color ratifications" (commit 498fef0):
//
//   item           rarity    body palette                      pass-reason
//   -------------  --------  --------------------------------  ----------------------------
//   war-axe        uncommon  slate heads (8A94A8) + wood haft  metal material identity (Opt
//                            (7A4B28) + gold binding (C9A227)  A); slate = rarity-common but
//                                                              metallic base, as steel-sword
//   crossbow       uncommon  wood stock (8A6A46/6B4F33) +      wood material identity (like
//                            slate prod (8A94A8)               wooden-shield); brown no tier
//                                                              frame color; no metal tag
//   spear          uncommon  slate leaf-head (8A94A8) + wood   metal material identity (Opt
//                            shaft (8A6A46) + collar (565F78)  A), as war-axe
//   iron-shield    uncommon  slate body (8A94A8) + steel boss  metal material identity (Opt A)
//                            + rivets (B8C0D0/565F78)
//   chainmail      uncommon  slate hauberk (8A94A8) + steel    metal material identity (Opt A)
//                            rings (565F78)
//   stamina-tonic  uncommon  arcane-cyan 0E7490 base / 06B6D4  RATIFIED override — supersedes
//                            highlight / 155E75 stroke; cork   artifact crimson placeholder
//                            + glass (9A7B4F/C9D2E0) unchanged  (D64550: compliant but hue-
//                                                              adjacent to life-red). Extends
//                                                              mana-potion cooldown_pct buff-
//                                                              catalyst cyan family; 06B6D4 ≠
//                                                              rarity-rare frame 3B82F6
//   poison-vial    uncommon  toxic-lime liquid 65A30D +        RATIFIED override — supersedes
//                            bubbles BEF264; glass/cork        artifact 22C55E placeholder
//                            (C9D2E0/9A7B4F) unchanged         (= rarity-uncommon frame: no
//                                                              Rare/Epic-poison headroom).
//                                                              poison tag color, ~59° hue off
//                                                              rarity-uncommon; fills § 5 slot
//   frost-shard    uncommon  icy-blue facets (8FCDEB/B9E3F7/   ice material/tag identity (Opt
//                            6FB8DE/7CC3E6)                    A); paler, held off rarity-rare
//                                                              3B82F6 (pre-existing ice exempt)
//   treasure-sack  uncommon  gold/amber (E0B84A/F2D66A/        gold currency identity (Opt A),
//                            C39A2E) + coin                    as copper-coin/coin-pouch; amber
//                                                              near legendary F59E0B, identity
//                                                              overrides
//
// Pass: all 9. Metal-tagged read slate (material identity); treasure-sack gold;
// frost-shard held-off-Rare ice; crossbow wood-brown; the two consumables carry
// the ratified overrides above. No body fill collides with a non-own, non-
// identity-exempted rarity color. Frame + gem remain the rarity authority per § 1.

const WarAxe = () => (
  <Strokey>
    <rect x="30" y="26" width="4" height="32" rx="1.5" fill="#7A4B28" />
    <rect x="28.8" y="44" width="6.4" height="11" rx="1.8" fill="#9B3B32" />
    <rect x="28.6" y="42.6" width="6.8" height="2.6" rx="1" fill="#C9A227" />
    <rect x="28.8" y="54.2" width="6.4" height="3.8" rx="1.2" fill="#C9A227" />
    <path d="M31 16 C 24 14 16 13 12 15 C 9 22 9 28 12 34 C 16 33 25 30 31 28 C 28 24 28 20 31 16 Z" fill="#8A94A8" stroke="#6E7893" strokeWidth="1" strokeLinejoin="round" />
    <path d="M33 16 C 40 14 48 13 52 15 C 55 22 55 28 52 34 C 48 33 39 30 33 28 C 36 24 36 20 33 16 Z" fill="#8A94A8" stroke="#6E7893" strokeWidth="1" strokeLinejoin="round" />
    <path d="M12 15 C 9 22 9 28 12 34" fill="none" stroke="#B8C0D0" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M52 15 C 55 22 55 28 52 34" fill="none" stroke="#B8C0D0" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M26 17 L 32 14 L 38 17 L 38 27 L 32 30 L 26 27 Z" fill="#C9A227" stroke="#9A7B1F" strokeWidth="1" strokeLinejoin="round" />
    <rect x="29.4" y="18.5" width="5.2" height="8" rx="1" fill="#E0C048" />
  </Strokey>
);

const Crossbow = () => (
  <Strokey>
    <path d="M42 12 C 54 24 54 40 42 52" fill="none" stroke="#8A94A8" strokeWidth="4.5" strokeLinecap="round" />
    <line x1="44" y1="14" x2="44" y2="50" stroke="#C9D2E0" strokeWidth="1.5" />
    <rect x="12" y="29" width="34" height="7" rx="2.5" fill="#8A6A46" />
    <rect x="11" y="25.5" width="7" height="15" rx="2" fill="#6B4F33" />
    <rect x="16" y="31.4" width="30" height="2.4" rx="1" fill="#3A2E20" />
    <path d="M45 29 L 52 32.6 L 45 36.2 Z" fill="#8A94A8" />
    <path d="M16 29.4 L 20.5 32.6 L 16 35.8 Z" fill="#6B4F33" />
  </Strokey>
);

const Spear = () => (
  <Strokey>
    <rect x="30.2" y="22" width="3.6" height="35" rx="1.8" fill="#8A6A46" />
    <rect x="30.2" y="53.5" width="3.6" height="4" rx="1" fill="#565F78" />
    <path d="M32 7 L 38.5 21 L 32 31 L 25.5 21 Z" fill="#8A94A8" stroke="#B8C0D0" strokeWidth="1.4" strokeLinejoin="round" />
    <rect x="29" y="27" width="6" height="5" rx="1.5" fill="#565F78" />
  </Strokey>
);

const IronShield = () => (
  <Strokey>
    <path d="M16 13 L 48 13 L 48 30 C 48 45 40 53 32 57 C 24 53 16 45 16 30 Z" fill="#8A94A8" stroke="#565F78" strokeWidth="2" strokeLinejoin="round" />
    <circle cx="32" cy="31" r="6.5" fill="#B8C0D0" stroke="#565F78" strokeWidth="1.4" />
    <circle cx="32" cy="31" r="2" fill="#565F78" />
    <circle cx="23" cy="20" r="1.8" fill="#565F78" />
    <circle cx="41" cy="20" r="1.8" fill="#565F78" />
    <circle cx="23" cy="41" r="1.8" fill="#565F78" />
    <circle cx="41" cy="41" r="1.8" fill="#565F78" />
  </Strokey>
);

const Chainmail = () => (
  <Strokey>
    <path d="M23 15 L 30 13 L 34 13 L 41 15 L 47 20 L 43 27 L 40 25 L 40 53 L 24 53 L 24 25 L 21 27 L 17 20 Z" fill="#8A94A8" stroke="#565F78" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M30 13 L 34 13 L 32 18 Z" fill="#565F78" />
    <g fill="none" stroke="#565F78" strokeWidth="1.1">
      <circle cx="28" cy="30" r="1.6" />
      <circle cx="32" cy="30" r="1.6" />
      <circle cx="36" cy="30" r="1.6" />
      <circle cx="30" cy="34" r="1.6" />
      <circle cx="34" cy="34" r="1.6" />
      <circle cx="28" cy="38" r="1.6" />
      <circle cx="32" cy="38" r="1.6" />
      <circle cx="36" cy="38" r="1.6" />
      <circle cx="30" cy="42" r="1.6" />
      <circle cx="34" cy="42" r="1.6" />
      <circle cx="28" cy="46" r="1.6" />
      <circle cx="32" cy="46" r="1.6" />
      <circle cx="36" cy="46" r="1.6" />
    </g>
  </Strokey>
);

const StaminaTonic = () => (
  <Strokey>
    <rect x="27.5" y="15" width="9" height="6" rx="1.5" fill="#9A7B4F" />
    <rect x="28.5" y="20" width="7" height="10" fill="#C9D2E0" />
    <circle cx="32" cy="41" r="15" fill="#0E7490" />
    <path d="M20 38 A 15 15 0 0 1 44 38 Z" fill="#06B6D4" opacity="0.9" />
    <ellipse cx="26" cy="36" rx="3" ry="5" fill="#F0F4FA" opacity="0.4" transform="rotate(-25 26 36)" />
    <circle cx="32" cy="41" r="15" fill="none" stroke="#155E75" strokeWidth="1.6" />
    <rect x="28.5" y="20" width="7" height="10" fill="none" stroke="#B8C0D0" strokeWidth="1.2" />
  </Strokey>
);

const PoisonVial = () => (
  <Strokey>
    <rect x="27.5" y="9" width="9" height="6" rx="1.5" fill="#9A7B4F" />
    <rect x="24.5" y="14" width="15" height="4" rx="1.5" fill="#B8C0D0" />
    <path d="M26 18 L 38 18 L 38 46 C 38 54 26 54 26 46 Z" fill="#C9D2E0" />
    <path d="M26 32 L 38 32 L 38 46 C 38 54 26 54 26 46 Z" fill="#65A30D" />
    <path d="M26 18 L 38 18 L 38 46 C 38 54 26 54 26 46 Z" fill="none" stroke="#8FA0B8" strokeWidth="1.4" />
    <circle cx="30" cy="42" r="1.3" fill="#BEF264" />
    <circle cx="34" cy="46" r="1.1" fill="#BEF264" />
    <circle cx="31" cy="49" r="0.9" fill="#BEF264" />
  </Strokey>
);

const FrostShard = () => (
  <Strokey>
    <path d="M32 7 L 43 27 L 34 57 L 22 27 Z" fill="#8FCDEB" stroke="#5DA9D6" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M32 7 L 22 27 L 32 26 Z" fill="#B9E3F7" />
    <path d="M32 7 L 43 27 L 32 26 Z" fill="#6FB8DE" />
    <path d="M32 26 L 34 57 L 22 27 Z" fill="#7CC3E6" opacity="0.55" />
    <path d="M18 42 L 23 39 L 21 50 Z" fill="#B9E3F7" stroke="#5DA9D6" strokeWidth="1" />
    <path d="M39.5 14 l3 0 M41 12.5 l0 3" stroke="#F0F4FA" strokeWidth="1.4" strokeLinecap="round" />
  </Strokey>
);

const TreasureSack = () => (
  <Strokey>
    <path d="M14 32 C 13 22 22 20 24 17 L 40 17 C 42 20 51 22 50 32 C 52 46 43 55 32 55 C 21 55 12 46 14 32 Z" fill="#E0B84A" stroke="#B78E2A" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M18 40 C 22 47 42 47 46 40 C 46 50 40 55 32 55 C 24 55 18 50 18 40 Z" fill="#C39A2E" opacity="0.55" />
    <path d="M24 17 C 24 12 40 12 40 17 Z" fill="#C39A2E" />
    <rect x="22" y="15" width="20" height="4.5" rx="2.2" fill="#B78E2A" />
    <circle cx="39" cy="46" r="5.5" fill="#F2D66A" stroke="#B78E2A" strokeWidth="1.2" />
    <circle cx="39" cy="46" r="2.2" fill="none" stroke="#B78E2A" strokeWidth="1" />
  </Strokey>
);

// String-keyed lookup so the literal slugs below assign cleanly post-
// M1.3.4a's ItemId broadening to a brand. Items outside this 33-icon
// subset (20 Commons + steel-sword/healing-salve/fire-oil/ember-brand + the
// 9 Uncommon batch-2 items) fall back to ICONS['copper-coin'] at the call
// site (DraggableItem, ShopSlot, etc.). Drop the fallback when icon-art
// expansion lands the full 45-item M1 content set.
export const ICONS: Record<string, () => JSX.Element> = {
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
  // Common batch 1 (2026-07-11) — 12 net-new placeholders
  'wooden-club': WoodenClub,
  'hand-axe': HandAxe,
  'iron-mace': IronMace,
  'throwing-knife': ThrowingKnife,
  'buckler': Buckler,
  'leather-vest': LeatherVest,
  'iron-cap': IronCap,
  'bread': Bread,
  'mana-potion': ManaPotion,
  'coin-pouch': CoinPouch,
  'lucky-penny': LuckyPenny,
  'bandage': Bandage,
  // Uncommon batch 2 (2026-07-11) — 9 net-new placeholders (union +9 → 33)
  'war-axe': WarAxe,
  'crossbow': Crossbow,
  'spear': Spear,
  'iron-shield': IronShield,
  'chainmail': Chainmail,
  'stamina-tonic': StaminaTonic,
  'poison-vial': PoisonVial,
  'frost-shard': FrostShard,
  'treasure-sack': TreasureSack,
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
