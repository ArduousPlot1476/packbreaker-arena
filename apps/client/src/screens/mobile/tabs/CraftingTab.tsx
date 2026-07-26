// Mobile [Crafting] tab content. Per Trey's decision-4 ratification +
// the M1.3.4a §7 scouting addition, plus the M2 recipe-ladder work, the
// tab renders THREE sections — the same KNOWN → HELD → READY ladder the
// desktop panel carries (screens/RecipeLadderPanel), ordered most-
// actionable-first because this surface is a tab, not an always-on panel:
//
//   READY TO CRAFT — recipes whose inputs are already 4-edge-adjacent
//     in the bag. Each row is a tappable COMBINE target. Mirrors (does
//     not replace) the COMBINE buttons anchored on the bag itself —
//     provides an ergonomic backup tap target for awkward anchor
//     positions.
//
//   AVAILABLE WITH CURRENT ITEMS — recipes whose inputs are present in
//     the bag (multiset match) but not yet adjacent. Read-only preview;
//     the player needs to rearrange items in the bag for the COMBINE
//     row to appear in the top section. M3 hint-system surfaces "tap
//     to auto-rearrange" affordance over this list.
//
//   OTHER RECIPES — everything else the player has not yet gathered the
//     inputs for. Quietest, last, and collapses to nothing once every
//     recipe has been reached, so it never displaces the actionable rows.
//
// Empty state (top section): "No recipes ready. Place items adjacent
// to see combinations." (Trey-ratified copy.)

import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { ITEMS } from '../../../run/content';
import { ICONS } from '../../../icons/icons';
import { combineMatchKey, type RecipeMatch } from '../../../run/recipes';
import { buildRecipeLadder } from '../../../run/recipeLadder';
import type { Recipe } from '../../../run/types';

interface CraftingTabProps {
  recipes: RecipeMatch[];
  scoutedRecipes: Recipe[];
  onCombine: (m: RecipeMatch) => void;
  /** combineMatchKey of a match the sim just rejected for lack of room —
   *  its READY row shows "NO ROOM — REARRANGE" in place of the input count. */
  rejectedKey?: string | null;
}

export function CraftingTab({
  recipes,
  scoutedRecipes,
  onCombine,
  rejectedKey,
}: CraftingTabProps) {
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
        gap: 16,
      }}
    >
      <ReadySection recipes={recipes} onCombine={onCombine} rejectedKey={rejectedKey} />
      <ScoutedSection recipes={scoutedRecipes} />
      <KnownSection recipes={recipes} scoutedRecipes={scoutedRecipes} />
    </div>
  );
}

function ReadySection({
  recipes,
  onCombine,
  rejectedKey,
}: {
  recipes: RecipeMatch[];
  onCombine: (m: RecipeMatch) => void;
  rejectedKey?: string | null;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex items-baseline gap-2">
        <div className="label-cap" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          READY TO CRAFT
        </div>
        <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {recipes.length}
        </div>
      </div>

      {recipes.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center"
          style={{
            padding: '32px 12px',
            border: '1px dashed var(--border-default)',
            borderRadius: 6,
            background: 'var(--surface)',
            gap: 6,
          }}
        >
          <div className="label-cap" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
            NO RECIPES READY
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textAlign: 'center',
              maxWidth: 240,
            }}
          >
            Place items adjacent to see combinations.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recipes.map((m, i) => {
            const outDef = ITEMS[m.recipe.output];
            const Icon = ICONS[outDef.id] ?? ICONS['copper-coin'];
            const rejected = rejectedKey != null && combineMatchKey(m) === rejectedKey;
            return (
              <div
                key={`${m.recipe.id}:${i}`}
                className="flex items-center gap-3"
                style={{
                  padding: 8,
                  borderRadius: 6,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-default)',
                }}
              >
                <RarityFrame rarity={outDef.rarity} w={outDef.w} h={outDef.h} size={36}>
                  <ItemIcon>
                    <Icon />
                  </ItemIcon>
                </RarityFrame>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      lineHeight: 1.2,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {outDef.name}
                  </div>
                  <div
                    className="label-cap"
                    style={{
                      fontSize: 9,
                      color: rejected ? 'var(--text-secondary)' : 'var(--text-muted)',
                      marginTop: 2,
                    }}
                  >
                    {rejected ? 'NO ROOM — REARRANGE' : `${m.uids.length} INPUTS`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onCombine(m)}
                  className="ease-snap hover-lift label-cap"
                  style={{
                    minHeight: 44,
                    padding: '10px 14px',
                    borderRadius: 6,
                    background: 'var(--r-legendary)',
                    color: 'var(--bg-deep)',
                    border: '2px solid var(--coin-stroke)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(245,158,11,0.30)',
                    touchAction: 'manipulation',
                  }}
                >
                  COMBINE
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ScoutedSection({ recipes }: { recipes: Recipe[] }) {
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex items-baseline gap-2">
        <div className="label-cap" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          AVAILABLE WITH CURRENT ITEMS
        </div>
        <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {recipes.length}
        </div>
      </div>
      {recipes.length === 0 ? (
        <div
          className="flex items-center justify-center"
          style={{
            padding: '20px 12px',
            border: '1px dashed var(--border-default)',
            borderRadius: 6,
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'var(--text-muted)',
              textAlign: 'center',
              maxWidth: 240,
            }}
          >
            No recipes possible with current items.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recipes.map((r) => {
          const outDef = ITEMS[r.output];
          const Icon = ICONS[outDef.id] ?? ICONS['copper-coin'];
          const inputNames = r.inputs.map((id) => ITEMS[id]?.name ?? String(id)).join(' + ');
          return (
            <div
              key={r.id}
              className="flex items-center gap-3"
              style={{
                padding: 8,
                borderRadius: 6,
                background: 'var(--surface)',
                border: '1px dashed var(--border-default)',
                opacity: 0.85,
              }}
            >
              <RarityFrame rarity={outDef.rarity} w={outDef.w} h={outDef.h} size={36}>
                <ItemIcon>
                  <Icon />
                </ItemIcon>
              </RarityFrame>
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {outDef.name}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginTop: 2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {inputNames}
                </div>
              </div>
              <div
                className="label-cap"
                style={{
                  fontSize: 9,
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-default)',
                  padding: '4px 8px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                }}
              >
                REARRANGE
              </div>
            </div>
          );
        })}
        </div>
      )}
    </div>
  );
}

/** The third rung: recipes the player does NOT yet hold the inputs for.
 *  Desktop gained an always-visible all-12 ladder (screens/RecipeLadderPanel);
 *  this is its mobile counterpart. It sits LAST and is the quietest section,
 *  so it never displaces READY or AVAILABLE — and the tab already scrolls
 *  (`overflow: auto` on the container), so the extra rows cost no layout at
 *  390-wide. Compact rows: no icons, one line per recipe. */
function KnownSection({
  recipes,
  scoutedRecipes,
}: {
  recipes: RecipeMatch[];
  scoutedRecipes: Recipe[];
}) {
  const known = buildRecipeLadder(recipes, scoutedRecipes).filter((r) => r.state === 'known');
  if (known.length === 0) return null;

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex items-baseline gap-2">
        <div className="label-cap" style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          OTHER RECIPES
        </div>
        <div className="label-cap tnum" style={{ fontSize: 9, color: 'var(--text-muted)' }}>
          {known.length}
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {known.map((r) => {
          const outDef = ITEMS[r.output];
          const inputNames = r.inputs.map((id) => ITEMS[id]?.name ?? String(id)).join(' + ');
          return (
            <div
              key={r.recipeId}
              className="flex items-center gap-2"
              style={{
                padding: '6px 8px',
                borderRadius: 6,
                background: 'var(--surface)',
                opacity: 0.7,
                minWidth: 0,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {inputNames} → {outDef?.name ?? String(r.output)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
