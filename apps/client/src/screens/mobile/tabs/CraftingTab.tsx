// Mobile [Crafting] tab content — active recipes mirror per Trey's
// decision-4 ratification (option A). Lists the recipes currently
// ready to combine in the bag, each row a tappable COMBINE target.
// Mirrors (does not replace) the COMBINE buttons anchored on the bag
// itself — provides an ergonomic backup tap target for awkward
// combine-anchor positions.
//
// Empty state: "No recipes ready. Place items adjacent to see
// combinations." (Trey-ratified copy.)

import { ItemIcon, RarityFrame } from '@packbreaker/ui-kit';
import { ITEMS } from '../../../run/content';
import { ICONS } from '../../../icons/icons';
import type { RecipeMatch } from '../../../run/recipes';

interface CraftingTabProps {
  recipes: RecipeMatch[];
  onCombine: (m: RecipeMatch) => void;
}

export function CraftingTab({ recipes, onCombine }: CraftingTabProps) {
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
        gap: 12,
      }}
    >
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
