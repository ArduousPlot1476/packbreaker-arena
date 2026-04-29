// combat-fixtures.test.ts — byte-comparable replay test for the M1.2.3b
// fixture suite. Loads every JSON file under fixtures/combats/, runs
// simulateCombat with the fixture's input (and optional customItems), and
// asserts result.events is deep-equal to expectedEvents.
//
// The fixtures are LOCKED. If a fixture diff appears, investigate the diff —
// don't regenerate. Determinism contract = byte-identical replay across
// platforms / versions.

import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ITEMS,
  type CombatEvent,
  type CombatInput,
  type CombatOutcome,
  type Item,
  type ItemId,
} from '@packbreaker/content';
import { simulateCombat } from '../src/combat';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures', 'combats');

interface FixtureFile {
  $comment?: string;
  name: string;
  description: string;
  input: CombatInput;
  customItems?: Record<string, Item>;
  expectedEvents: ReadonlyArray<CombatEvent>;
  expectedOutcome: CombatOutcome;
  expectedFinalHp: { player: number; ghost: number };
  expectedEndedAtTick: number;
}

const fixtureFiles = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

describe('combat fixtures (byte-comparable replay)', () => {
  for (const file of fixtureFiles) {
    const raw = readFileSync(join(FIXTURES_DIR, file), 'utf-8');
    const fixture = JSON.parse(raw) as FixtureFile;

    it(`${fixture.name} — ${fixture.description.slice(0, 70)}${fixture.description.length > 70 ? '…' : ''}`, () => {
      const items = fixture.customItems
        ? ({ ...ITEMS, ...fixture.customItems } as Readonly<Record<ItemId, Item>>)
        : undefined;
      const result = simulateCombat(fixture.input, items ? { items } : undefined);

      expect(result.outcome).toBe(fixture.expectedOutcome);
      expect(result.finalHp).toEqual(fixture.expectedFinalHp);
      expect(result.endedAtTick).toBe(fixture.expectedEndedAtTick);
      expect(result.events).toEqual(fixture.expectedEvents);
    });
  }
});
