// Mobile [Crafting] tab content. Per Trey's decision-4 ratification +
// the M1.3.4a §7 scouting addition, the tab now renders TWO sections:
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
// Empty state (top section): "No recipes ready. Place items adjacent
// to see combinations." (Trey-ratified copy.)

import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { ITEMS } from '../../../run/content';
import { ICONS } from '../../../icons/icons';
import type { RecipeMatch } from '../../../run/recipes';
import type { Recipe } from '../../../run/types';

interface CraftingTabProps {
  recipes: RecipeMatch[];
  scoutedRecipes: Recipe[];
  onCombine: (m: RecipeMatch) => void;
}

export function CraftingTab({ recipes, scoutedRecipes, onCombine }: CraftingTabProps) {
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
      <ReadySection recipes={recipes} onCombine={onCombine} />
      <ScoutedSection recipes={scoutedRecipes} />
    </div>
  );
}

function ReadySection({
  recipes,
  onCombine,
}: {
  recipes: RecipeMatch[];
  onCombine: (m: RecipeMatch) => void;
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
                    style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}
                  >
                    {m.uids.length} INPUTS
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
