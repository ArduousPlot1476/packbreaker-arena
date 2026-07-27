// Unit tests for the recipe-ladder derivation. The load-bearing properties
// are: all 12 recipes are ALWAYS present (the KNOWN rung is what makes the
// rule legible before the player owns anything), the three rungs are mutually
// exclusive, and READY outranks HELD so a row never renders two states.

import { describe, expect, it } from 'vitest';
import { buildRecipeLadder, countByState } from './recipeLadder';
import { RECIPES } from './content';
import type { ItemId, Recipe, RecipeMatch } from './types';

const SWORD = 'iron-sword' as ItemId;
const DAGGER = 'iron-dagger' as ItemId;
const STEEL = 'steel-sword' as ItemId;
const HERB = 'healing-herb' as ItemId;
const SALVE = 'healing-salve' as ItemId;

const STEEL_RECIPE: Recipe = { id: 'r-steel-sword', inputs: [SWORD, DAGGER], output: STEEL };
const SALVE_RECIPE: Recipe = { id: 'r-healing-salve', inputs: [HERB, HERB], output: SALVE };

const STEEL_MATCH: RecipeMatch = { recipe: STEEL_RECIPE, uids: ['a', 'b'] };

describe('buildRecipeLadder', () => {
  it('always returns every known recipe, even with an empty bag', () => {
    const rows = buildRecipeLadder([], []);
    expect(rows).toHaveLength(RECIPES.length);
    expect(RECIPES.length).toBe(12);
  });

  it('marks everything KNOWN when nothing is held or ready', () => {
    const rows = buildRecipeLadder([], []);
    expect(rows.every((r) => r.state === 'known')).toBe(true);
    expect(countByState(rows, 'known')).toBe(12);
    expect(countByState(rows, 'held')).toBe(0);
    expect(countByState(rows, 'ready')).toBe(0);
  });

  it('promotes a scouted recipe to HELD and carries no match', () => {
    const rows = buildRecipeLadder([], [SALVE_RECIPE]);
    const salve = rows.find((r) => r.recipeId === 'r-healing-salve');
    expect(salve?.state).toBe('held');
    expect(salve?.match).toBeNull();
    expect(countByState(rows, 'held')).toBe(1);
    // The other 11 stay visible on the KNOWN rung.
    expect(countByState(rows, 'known')).toBe(11);
  });

  it('promotes a detected match to READY and carries the match', () => {
    const rows = buildRecipeLadder([STEEL_MATCH], []);
    const steel = rows.find((r) => r.recipeId === 'r-steel-sword');
    expect(steel?.state).toBe('ready');
    expect(steel?.match).toBe(STEEL_MATCH);
    expect(countByState(rows, 'ready')).toBe(1);
  });

  it('lets READY win over HELD when a recipe appears on both inputs', () => {
    // useRun already filters scouted against ready; this asserts the
    // classification does not DEPEND on that upstream filtering.
    const rows = buildRecipeLadder([STEEL_MATCH], [STEEL_RECIPE]);
    const steel = rows.find((r) => r.recipeId === 'r-steel-sword');
    expect(steel?.state).toBe('ready');
    expect(countByState(rows, 'held')).toBe(0);
    // Exactly one row per recipe — no duplication across rungs.
    expect(rows).toHaveLength(12);
    expect(new Set(rows.map((r) => r.recipeId)).size).toBe(12);
  });

  it('orders the ladder READY → HELD → KNOWN', () => {
    const rows = buildRecipeLadder([STEEL_MATCH], [SALVE_RECIPE]);
    expect(rows[0]!.state).toBe('ready');
    expect(rows[0]!.recipeId).toBe('r-steel-sword');
    expect(rows[1]!.state).toBe('held');
    expect(rows[1]!.recipeId).toBe('r-healing-salve');
    expect(rows.slice(2).every((r) => r.state === 'known')).toBe(true);
  });

  it('keeps canonical order stable within a rung', () => {
    const rows = buildRecipeLadder([], []);
    expect(rows.map((r) => r.recipeId)).toEqual(RECIPES.map((r) => r.id));
  });

  it('joins a canonical display name onto every row', () => {
    const rows = buildRecipeLadder([], []);
    const steel = rows.find((r) => r.recipeId === 'r-steel-sword');
    expect(steel?.name).toBe('Forge Steel');
    // No row falls back to its raw id.
    expect(rows.every((r) => r.name !== r.recipeId)).toBe(true);
  });

  it('carries the first match when a recipe has two ready clusters', () => {
    const second: RecipeMatch = { recipe: STEEL_RECIPE, uids: ['c', 'd'] };
    const rows = buildRecipeLadder([STEEL_MATCH, second], []);
    const steel = rows.find((r) => r.recipeId === 'r-steel-sword');
    expect(steel?.match).toBe(STEEL_MATCH);
    expect(rows).toHaveLength(12);
  });
});
