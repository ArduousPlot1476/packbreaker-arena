// Render-level guard for the Uncommon batch-2 icons (Rule 19 — verify the
// rendered output, not just the map wiring). Each of the 9 is resolved exactly
// as the call sites do (ICONS[id] ?? ICONS['copper-coin']) and rendered to
// static SVG markup; we assert it produced its OWN icon (signature body fill,
// markup distinct from the copper-coin fallback) rather than silently falling
// back. The two ratified overrides are checked for the new hex AND the absence
// of the superseded Design-artifact placeholder.

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ICONS } from './icons';

const CopperCoin = ICONS['copper-coin'];
const FALLBACK = renderToStaticMarkup(<CopperCoin />);

// id -> a body-fill hex unique to that icon (present in its markup)
const SIGNATURE: Record<string, string> = {
  'war-axe': '#7A4B28',
  'crossbow': '#8A6A46',
  'spear': '#8A94A8',
  'iron-shield': '#8A94A8',
  'chainmail': '#565F78',
  'stamina-tonic': '#0E7490',
  'poison-vial': '#65A30D',
  'frost-shard': '#8FCDEB',
  'treasure-sack': '#E0B84A',
};

describe('Uncommon batch-2 icons render to their own SVG (not copper-coin fallback)', () => {
  for (const [id, hex] of Object.entries(SIGNATURE)) {
    it(`${id} renders <svg> with signature fill ${hex}, distinct from the fallback`, () => {
      const Comp = ICONS[id] ?? ICONS['copper-coin'];
      const markup = renderToStaticMarkup(<Comp />);
      expect(markup).toContain('<svg');
      expect(markup.toLowerCase()).toContain(hex.toLowerCase());
      expect(markup).not.toBe(FALLBACK);
    });
  }

  it('stamina-tonic renders ratified arcane-cyan, not the crimson placeholder', () => {
    const Comp = ICONS['stamina-tonic'];
    const m = renderToStaticMarkup(<Comp />).toLowerCase();
    expect(m).toContain('#0e7490');
    expect(m).toContain('#06b6d4');
    expect(m).toContain('#155e75');
    expect(m).not.toContain('#d64550'); // superseded base
    expect(m).not.toContain('#e0737b'); // superseded highlight
    expect(m).not.toContain('#a83843'); // superseded stroke
  });

  it('poison-vial renders ratified toxic-lime, not the #22C55E placeholder', () => {
    const Comp = ICONS['poison-vial'];
    const m = renderToStaticMarkup(<Comp />).toLowerCase();
    expect(m).toContain('#65a30d');
    expect(m).toContain('#bef264');
    expect(m).not.toContain('#22c55e'); // superseded liquid (= uncommon frame)
    expect(m).not.toContain('#86efac'); // superseded bubbles
  });
});
