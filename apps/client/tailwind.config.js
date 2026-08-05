/** @type {import('tailwindcss').Config} */
//
// Colors map to the CSS custom properties declared in src/index.css, which are
// themselves pinned to packages/ui-kit/src/palette.ts by src/palette.test.ts.
// Referencing the vars rather than re-typing hexes keeps this file from becoming
// a fourth copy of the palette — the exact problem the ui-kit module exists to
// end. This is the `visual-direction.md` § 12 deliverable ("locked palette as
// Tailwind tokens"), which had never been built.
//
// Note: `<alpha-value>` is intentionally absent. These are plain `var()`
// references, so Tailwind's slash-opacity syntax (`bg-surface/50`) does NOT
// work on them. Use the palette module's `rgba()` helper when you need alpha on
// a palette hue — one hue, one source, in both cases.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        'bg-deep': 'var(--bg-deep)',
        'bg-mid': 'var(--bg-mid)',
        surface: 'var(--surface)',
        'surface-elev': 'var(--surface-elev)',
        'border-default': 'var(--border-default)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        accent: 'var(--accent)',
        'r-common': 'var(--r-common)',
        'r-uncommon': 'var(--r-uncommon)',
        'r-rare': 'var(--r-rare)',
        'r-epic': 'var(--r-epic)',
        'r-legendary': 'var(--r-legendary)',
        'life-red': 'var(--life-red)',
        'life-stroke': 'var(--life-stroke)',
        'coin-fill': 'var(--coin-fill)',
        'coin-stroke': 'var(--coin-stroke)',
        'adjacency-teal': 'var(--adjacency-teal)',
      },
    },
  },
  plugins: [],
};
