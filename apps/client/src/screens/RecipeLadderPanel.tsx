// Desktop recipe panel — the three-state ladder (KNOWN → HELD → READY).
//
// Desktop has been blind to recipes it could reach: `scoutedRecipes` was
// computed in useRun but consumed only by the mobile Crafting tab, and
// RecipeGlow fires only once inputs are ALREADY adjacent. A desktop player
// could hold iron-sword + iron-dagger all run and never learn that placing
// them edge-to-edge yields a steel-sword.
//
// The panel is always rendered and always shows all 12 recipes, so the rule
// is legible before the player owns anything. The rung a row sits on is
// carried by FOUR non-colour channels so the ladder survives greyscale:
//
//   channel        READY            HELD             KNOWN
//   left border    3px solid        3px dashed       none
//   status word    'READY'          'NOT TOUCHING'   '—'
//   chip fill      filled           outlined         absent
//   name weight    700              600              500
//
// Rows are TEXT, not icon glyphs — Codex round 1 (P2). An earlier cut rendered
// each input through RarityFrame at size 18, which is unusable: the component
// applies a fixed 6px pad inside a 1px border (RarityFrame.tsx:66), leaving a
// 4px content box, and its gem floor is Math.max(8, …) (RarityFrame.tsx:38), so
// an 8px gem sat on top of an 18px frame. The inputs were unidentifiable, and
// the rows named only the OUTPUT — so the one fact this panel exists to teach,
// which inputs a recipe needs, appeared nowhere on desktop. RarityFrame is
// built for 42-88px bag cells and shop cards; below ~40px it emits noise rather
// than information, so the ladder names items instead of drawing them. The bag
// and shop remain the iconographic surfaces.
//
// Layout: a 2-column grid, so all 12 rows land without scrolling in the
// vertical slack under the 528×352 bag at the 1280×720 baseline. The height
// budget is measured rather than assumed — see ROW_HEIGHT below. The grid
// scrolls as a safety net, but at the baseline nothing scrolls, and the bag
// is never covered or pushed off-screen.

import { ITEMS } from '../run/content';
import { buildRecipeLadder, countByState, type RecipeLadderRow } from '../run/recipeLadder';
import type { Recipe, RecipeMatch } from '../run/types';
import { combineMatchKey } from '../run/recipes';

interface RecipeLadderPanelProps {
  /** Contiguous, combinable matches — detectRecipes output. */
  recipes: RecipeMatch[];
  /** Owned-but-not-contiguous recipes — scoutRecipes output. */
  scoutedRecipes: Recipe[];
  onCombine: (m: RecipeMatch) => void;
  /** combineMatchKey of a match the sim rejected for lack of room. */
  rejectedKey?: string | null;
}

// Measured against a real 1280×720 capture, not assumed. The middle flex row
// is 720 − 48 TopBar − 32 BottomPanel = 640. The bag block (header + 4×88 grid
// + footer) measures ~400, and the column gap is 10, leaving ~230 for the whole
// panel. Panel height = 8 padTop + 22 header + 6 gap + (6 × ROW_HEIGHT + 15
// grid gaps) + 10 padBottom + 2 border. At ROW_HEIGHT 27 that is 225 — inside
// the budget. Two earlier values (34, then 30) both overflowed and painted over
// BottomPanel, which is why this is pinned to a measurement.
const ROW_HEIGHT = 27;

export function RecipeLadderPanel({
  recipes,
  scoutedRecipes,
  onCombine,
  rejectedKey,
}: RecipeLadderPanelProps) {
  const rows = buildRecipeLadder(recipes, scoutedRecipes);
  const readyCount = countByState(rows, 'ready');
  const heldCount = countByState(rows, 'held');

  return (
    <div
      data-testid="recipe-ladder-panel"
      className="flex flex-col"
      style={{
        width: '100%',
        maxWidth: 840,
        padding: '8px 12px 10px',
        background: 'var(--bg-mid)',
        border: '1px solid var(--border-default)',
        borderRadius: 8,
        gap: 6,
      }}
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <div className="label-cap" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            RECIPES
          </div>
          {/* The rule itself, stated whether or not the player holds anything.
              This is the line the desktop surface has never carried. */}
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Inputs must sit edge-to-edge in the bag to combine.
          </div>
        </div>
        <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          <span style={{ color: readyCount > 0 ? 'var(--r-legendary)' : 'var(--text-muted)' }}>
            {readyCount} READY
          </span>
          {' · '}
          <span style={{ color: heldCount > 0 ? 'var(--accent)' : 'var(--text-muted)' }}>
            {heldCount} HELD
          </span>
          {' · '}
          <span>{rows.length} KNOWN</span>
        </div>
      </div>

      <div
        className="grid"
        style={{
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: '3px 10px',
          maxHeight: ROW_HEIGHT * 6 + 15,
          overflowY: 'auto',
          flex: '0 1 auto',
          minHeight: 0,
        }}
      >
        {rows.map((row) => (
          <LadderRow
            key={row.recipeId}
            row={row}
            onCombine={onCombine}
            rejected={
              row.match != null && rejectedKey != null && combineMatchKey(row.match) === rejectedKey
            }
          />
        ))}
      </div>
    </div>
  );
}

/** Per-state presentation. Every field here is a non-colour channel except
 *  `accent`, so the ladder reads in greyscale. */
const PRESENTATION: Record<
  RecipeLadderRow['state'],
  {
    borderStyle: 'solid' | 'dashed' | 'none';
    accent: string;
    nameWeight: number;
    nameColor: string;
    statusWord: string;
    chipFilled: boolean;
  }
> = {
  ready: {
    borderStyle: 'solid',
    accent: 'var(--r-legendary)',
    nameWeight: 700,
    nameColor: 'var(--text-primary)',
    statusWord: 'READY',
    chipFilled: true,
  },
  held: {
    borderStyle: 'dashed',
    accent: 'var(--accent)',
    nameWeight: 600,
    nameColor: 'var(--text-primary)',
    statusWord: 'NOT TOUCHING',
    chipFilled: false,
  },
  known: {
    borderStyle: 'none',
    accent: 'var(--border-default)',
    nameWeight: 500,
    nameColor: 'var(--text-muted)',
    statusWord: '—',
    chipFilled: false,
  },
};

function LadderRow({
  row,
  onCombine,
  rejected,
}: {
  row: RecipeLadderRow;
  onCombine: (m: RecipeMatch) => void;
  rejected: boolean;
}) {
  const p = PRESENTATION[row.state];
  const outputName = ITEMS[row.output]?.name ?? String(row.output);
  const inputNames = row.inputs.map((id) => ITEMS[id]?.name ?? String(id)).join(' + ');

  return (
    <div
      data-testid={`ladder-row-${row.recipeId}`}
      data-state={row.state}
      className="flex items-center"
      style={{
        minHeight: ROW_HEIGHT,
        gap: 8,
        padding: '1px 8px',
        borderRadius: 5,
        background: row.state === 'known' ? 'transparent' : 'var(--surface)',
        // Longhand, not the `border-left` shorthand: a shorthand carrying a
        // var() is parsed unreliably (jsdom drops the style component
        // outright), and the border STYLE is a load-bearing greyscale
        // channel, so it has to survive as its own declaration.
        borderLeftWidth: 3,
        borderLeftStyle: p.borderStyle === 'none' ? 'solid' : p.borderStyle,
        borderLeftColor: p.borderStyle === 'none' ? 'transparent' : p.accent,
        opacity: row.state === 'known' ? 0.72 : 1,
      }}
    >
      <div className="flex-1" style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: p.nameWeight,
            color: p.nameColor,
            lineHeight: 1.15,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.name}
        </div>
        {/* Codex round 1 (P2): the inputs MUST be named in text. The row
            previously carried icon glyphs plus the output name, so the one
            thing a player needs from this panel — which inputs a recipe
            requires — appeared nowhere on desktop. */}
        <div
          style={{
            fontSize: 9,
            color: 'var(--text-muted)',
            lineHeight: 1.2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${inputNames} → ${outputName}`}
        >
          {inputNames} → {outputName}
        </div>
      </div>

      {row.state === 'ready' && row.match ? (
        <button
          type="button"
          onClick={() => onCombine(row.match!)}
          className="ease-snap hover-lift label-cap"
          style={{
            padding: '4px 9px',
            borderRadius: 4,
            background: 'var(--r-legendary)',
            color: 'var(--bg-deep)',
            border: '1px solid var(--coin-stroke)',
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {rejected ? 'NO ROOM' : 'COMBINE'}
        </button>
      ) : (
        <div
          className="label-cap"
          style={{
            fontSize: 8,
            padding: '2px 6px',
            borderRadius: 3,
            whiteSpace: 'nowrap',
            color: p.chipFilled ? 'var(--bg-deep)' : p.accent,
            background: p.chipFilled ? p.accent : 'transparent',
            border: row.state === 'known' ? '1px solid transparent' : `1px solid ${p.accent}`,
          }}
        >
          {p.statusWord}
        </div>
      )}
    </div>
  );
}
