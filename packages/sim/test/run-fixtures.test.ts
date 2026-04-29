// run-fixtures.test.ts — byte-comparable replay test for the M1.2.4 run
// fixture suite. Loads every JSON file under fixtures/runs/, replays the
// action stream against a fresh RunController, and asserts result final
// state + recorded telemetry deep-equal the fixture's expected values.
//
// Fixtures are LOCKED. If a fixture diff appears, investigate the diff —
// don't regenerate. Determinism contract = identical inputs → identical
// run trajectory.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type CellCoord,
  type ClassId,
  type Combatant,
  type ContractId,
  type Item,
  type ItemId,
  type PlacementId,
  type RecipeId,
  type RelicId,
  type Rotation,
  type RunState,
  type SimSeed,
  type TelemetryEvent,
} from '@packbreaker/content';
import { createRun, type RunPhase } from '../src/run';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures', 'runs');

type Action =
  | { type: 'buyItem'; slotIndex: number }
  | { type: 'sellItem'; placementId: string }
  | { type: 'placeItem'; itemId: string; anchor: CellCoord; rotation: Rotation }
  | { type: 'moveItem'; placementId: string; anchor: CellCoord; rotation: Rotation }
  | { type: 'rotateItem'; placementId: string; rotation: Rotation }
  | { type: 'rerollShop' }
  | { type: 'combineRecipe'; recipeId: string }
  | { type: 'startCombat'; ghost: Combatant }
  | { type: 'advancePhase' };

interface RunFixture {
  $comment?: string;
  name: string;
  description: string;
  input: {
    seed: number;
    classId: string;
    contractId: string;
    startingRelicId: string;
    customItems?: Record<string, Item>;
  };
  actions: ReadonlyArray<Action>;
  expectedFinalPhase: RunPhase;
  expectedFinalState: RunState;
  expectedTelemetryEvents: ReadonlyArray<TelemetryEvent>;
}

const fixtureFiles = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

describe('run fixtures (byte-comparable replay)', () => {
  for (const file of fixtureFiles) {
    const raw = readFileSync(join(FIXTURES_DIR, file), 'utf-8');
    const fixture = JSON.parse(raw) as RunFixture;

    it(`${fixture.name} — ${fixture.description.slice(0, 80)}${fixture.description.length > 80 ? '…' : ''}`, () => {
      const events: TelemetryEvent[] = [];
      const ctrl = createRun({
        seed: fixture.input.seed as SimSeed,
        classId: fixture.input.classId as ClassId,
        contractId: fixture.input.contractId as ContractId,
        startingRelicId: fixture.input.startingRelicId as RelicId,
        itemsRegistry: fixture.input.customItems as
          | Readonly<Record<ItemId, Item>>
          | undefined,
        onTelemetryEvent: (e) => events.push(e),
      });

      for (const action of fixture.actions) {
        switch (action.type) {
          case 'buyItem':
            ctrl.buyItem(action.slotIndex);
            break;
          case 'sellItem':
            ctrl.sellItem(action.placementId as PlacementId);
            break;
          case 'placeItem':
            ctrl.placeItem(action.itemId as ItemId, action.anchor, action.rotation);
            break;
          case 'moveItem':
            ctrl.moveItem(action.placementId as PlacementId, action.anchor, action.rotation);
            break;
          case 'rotateItem':
            ctrl.rotateItem(action.placementId as PlacementId, action.rotation);
            break;
          case 'rerollShop':
            ctrl.rerollShop();
            break;
          case 'combineRecipe':
            ctrl.combineRecipe(action.recipeId as RecipeId);
            break;
          case 'startCombat':
            ctrl.startCombat(action.ghost);
            break;
          case 'advancePhase':
            ctrl.advancePhase();
            break;
        }
      }

      expect(ctrl.getPhase()).toBe(fixture.expectedFinalPhase);
      expect(ctrl.getState()).toEqual(fixture.expectedFinalState);
      expect(events).toEqual(fixture.expectedTelemetryEvents);
    });
  }
});
