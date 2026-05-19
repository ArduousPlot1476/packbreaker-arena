// M1.5b PR 2 Step 5 — RunEndScreen component tests (mirrors
// ClassSelectScreen.test.tsx pattern).
//
// Tests the 8 ratified fields, sub-copy helper, empty-relic-slot
// treatment, breadcrumb W/L/untouched states, outcome glyph + label
// + sub-copy across all three terminal states, onRestart wiring, and
// mobile responsive class toggle. Stub useRunContext + useViewport
// rather than going through full RunProvider (integration coverage
// lives in RunEndFlow.test.tsx).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import type {
  ClassId,
  ContractId,
  RelicId,
  RoundNumber,
  RunId,
  RunOutcome,
  SimSeed,
} from '@packbreaker/content';
import { DEFAULT_RULESET } from '@packbreaker/content';
import type { ClientRunState } from '../run/RunController';
import { runEndSubCopy } from './RunEndScreen';

// Stub useRunContext + useViewport so we can drive the component with
// fixture state without RunProvider's full machinery.
const mocks = vi.hoisted(() => ({
  ctxValue: null as unknown as { state: ClientRunState },
  viewport: 'desktop' as 'desktop' | 'mobile',
}));

vi.mock('../run/RunContext', () => ({
  useRunContext: () => mocks.ctxValue,
}));

vi.mock('../run/useViewport', () => ({
  useViewport: () => mocks.viewport,
}));

// Import RunEndScreen AFTER the mocks are declared so its module-level
// imports resolve to the stubbed versions.
import { RunEndScreen } from './RunEndScreen';

/** Build a wrapped context-value shape matching useRunContext's return
 *  shape (the full useRun() hook value). RunEndScreen only reads `.state`
 *  from it, so we only need to populate that field for these unit tests. */
function makeCtx(stateOverrides: Partial<ClientRunState['state']> = {}): { state: ClientRunState } {
  const clientState: ClientRunState = {
    bag: [],
    shop: [],
    drag: null,
    hover: null,
    combatActive: false,
    state: {
      round: 11,
      totalRounds: 11,
      hearts: 3,
      maxHearts: 4,
      gold: 142,
      trophy: 1284,
      rerollCount: 0,
      className: 'Marauder',
      contractName: 'Neutral',
      contractText: 'No modifiers',
      ruleset: DEFAULT_RULESET,
      runId: 'test-run-id' as RunId,
      classId: 'marauder' as ClassId,
      contractId: 'neutral' as ContractId,
      derived: { extraRerollsPerRound: 0, itemCostDelta: 0, bonusGoldOnWin: 0 },
      relics: {
        starter: 'iron-will' as RelicId,
        mid: 'berserkers-pendant' as RelicId,
        boss: 'conquerors-crown' as RelicId,
      },
      outcome: 'won' as RunOutcome,
      seed: 12345 as SimSeed,
      history: Array.from({ length: 11 }, (_, i) => ({
        round: (i + 1) as RoundNumber,
        outcome: i === 2 ? ('loss' as const) : ('win' as const),
        damageDealt: 30,
        damageTaken: i === 2 ? 30 : 8,
        goldEarnedThisRound: 5,
        opponentGhostId: null,
        opponentClassId: null,
      })),
      ...stateOverrides,
    },
  };
  return { state: clientState };
}

beforeEach(() => {
  mocks.ctxValue = makeCtx();
  mocks.viewport = 'desktop';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runEndSubCopy — pure helper', () => {
  it('won → "Round N boss defeated"', () => {
    expect(runEndSubCopy('won', 11)).toBe('Round 11 boss defeated');
  });
  it('eliminated → "Eliminated · Round N"', () => {
    expect(runEndSubCopy('eliminated', 7)).toBe('Eliminated · Round 7');
  });
  it('abandoned → "Quit at Round N"', () => {
    expect(runEndSubCopy('abandoned', 4)).toBe('Quit at Round 4');
  });
  it('in_progress → empty string (defensive — should never be invoked here)', () => {
    expect(runEndSubCopy('in_progress', 5)).toBe('');
  });
});

describe('RunEndScreen — all 8 ratified fields render (VICTORY baseline)', () => {
  it('renders outcome label + glyph + sub-copy for won', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    expect(getByTestId('runend-label').textContent).toBe('VICTORY');
    expect(getByTestId('runend-glyph').textContent).toBe('★');
    expect(getByTestId('runend-sub').textContent).toBe('Round 11 boss defeated');
  });

  it('renders class name from state.className', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    expect(getByTestId('runend-class').textContent).toBe('Marauder');
  });

  it('renders round-reached as "N / totalRounds"', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    expect(getByTestId('runend-round').textContent).toBe('11 / 11');
  });

  it('renders hearts pip row using HeartGlyph (3 filled of 4 max — Iron Will Marauder mid-loss)', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    const hearts = getByTestId('runend-hearts');
    expect(hearts.getAttribute('data-hearts-filled')).toBe('3');
    expect(hearts.getAttribute('data-hearts-max')).toBe('4');
    // HeartGlyph is an SVG component; the count of <svg> children equals maxHearts.
    expect(hearts.querySelectorAll('svg')).toHaveLength(4);
  });

  it('renders all 3 relic slots filled with names from RELICS registry', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    const starter = getByTestId('runend-relic-starter');
    const mid = getByTestId('runend-relic-mid');
    const boss = getByTestId('runend-relic-boss');
    // Tier labels are uppercased via CSS (text-transform: uppercase),
    // not via JS — textContent observes the original source case.
    expect(starter.getAttribute('data-empty')).toBe('false');
    expect(starter.textContent).toContain('Iron Will');
    expect(starter.textContent).toContain('Starter');
    expect(mid.getAttribute('data-empty')).toBe('false');
    expect(mid.textContent).toContain("Berserker's Pendant");
    expect(mid.textContent).toContain('Mid');
    expect(boss.getAttribute('data-empty')).toBe('false');
    expect(boss.textContent).toContain("Conqueror's Crown");
    expect(boss.textContent).toContain('Boss');
  });

  it('renders 11 breadcrumb pips with correct W/L outcomes from history', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    // Fixture history: rounds 1, 2, 4-11 = win; round 3 = loss.
    for (let i = 1; i <= 11; i++) {
      const pip = getByTestId(`runend-pip-${i}`);
      const expectedOutcome = i === 3 ? 'loss' : 'win';
      expect(pip.getAttribute('data-outcome')).toBe(expectedOutcome);
    }
  });

  it('renders gold + trophy with toLocaleString formatting', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    expect(getByTestId('runend-gold').textContent).toBe('142');
    expect(getByTestId('runend-trophy').textContent).toBe('1,284');
  });

  it('invokes onRestart when the CTA is clicked', () => {
    const onRestart = vi.fn();
    const { getByTestId } = render(<RunEndScreen onRestart={onRestart} />);
    fireEvent.click(getByTestId('runend-restart-cta'));
    expect(onRestart).toHaveBeenCalledOnce();
  });
});

describe('RunEndScreen — outcome variants render correct glyph + label + sub-copy', () => {
  it('DEFEAT (eliminated): glyph + label + sub-copy', () => {
    mocks.ctxValue = makeCtx({
      outcome: 'eliminated',
      round: 7 as RoundNumber,
      hearts: 0,
      maxHearts: 3,
      classId: 'tinker' as ClassId,
      className: 'Tinker',
      relics: {
        starter: 'apprentices-loop' as RelicId,
        mid: 'resonant-anchor' as RelicId,
        boss: null,
      },
      history: [
        { round: 1 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
        { round: 2 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 6, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
        { round: 3 as RoundNumber, outcome: 'loss', damageDealt: 12, damageTaken: 30, goldEarnedThisRound: 0, opponentGhostId: null, opponentClassId: null },
        { round: 4 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
        { round: 5 as RoundNumber, outcome: 'loss', damageDealt: 8, damageTaken: 30, goldEarnedThisRound: 0, opponentGhostId: null, opponentClassId: null },
        { round: 6 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
        { round: 7 as RoundNumber, outcome: 'loss', damageDealt: 6, damageTaken: 30, goldEarnedThisRound: 0, opponentGhostId: null, opponentClassId: null },
      ],
      gold: 38,
      trophy: 612,
    });
    const { getByTestId } = render(<RunEndScreen onRestart={() => {}} />);
    expect(getByTestId('runend-label').textContent).toBe('DEFEAT');
    expect(getByTestId('runend-glyph').textContent).toBe('✕');
    expect(getByTestId('runend-sub').textContent).toBe('Eliminated · Round 7');
    for (let i = 8; i <= 11; i++) {
      expect(getByTestId(`runend-pip-${i}`).getAttribute('data-outcome')).toBe('untouched');
    }
  });

  it('RUN ABANDONED (abandoned): glyph + label + sub-copy + empty-slot treatment for mid + boss', () => {
    mocks.ctxValue = makeCtx({
      outcome: 'abandoned',
      round: 4 as RoundNumber,
      hearts: 2,
      relics: {
        starter: 'iron-will' as RelicId,
        mid: null,
        boss: null,
      },
      history: [
        { round: 1 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 4, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
        { round: 2 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 8, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
        { round: 3 as RoundNumber, outcome: 'loss', damageDealt: 14, damageTaken: 30, goldEarnedThisRound: 0, opponentGhostId: null, opponentClassId: null },
        { round: 4 as RoundNumber, outcome: 'win', damageDealt: 30, damageTaken: 6, goldEarnedThisRound: 5, opponentGhostId: null, opponentClassId: null },
      ],
      gold: 22,
      trophy: 408,
    });
    const { getByTestId } = render(<RunEndScreen onRestart={() => {}} />);
    expect(getByTestId('runend-label').textContent).toBe('RUN ABANDONED');
    expect(getByTestId('runend-glyph').textContent).toBe('⊘');
    expect(getByTestId('runend-sub').textContent).toBe('Quit at Round 4');
    const mid = getByTestId('runend-relic-mid');
    const boss = getByTestId('runend-relic-boss');
    expect(mid.getAttribute('data-empty')).toBe('true');
    expect(mid.textContent).toContain('—');
    expect(boss.getAttribute('data-empty')).toBe('true');
    expect(boss.textContent).toContain('—');
    for (let i = 5; i <= 11; i++) {
      expect(getByTestId(`runend-pip-${i}`).getAttribute('data-outcome')).toBe('untouched');
    }
  });
});

describe('RunEndScreen — mobile responsive class toggle (Q(d) single-component pattern)', () => {
  it('runend-screen has data-viewport="desktop" when useViewport returns desktop', () => {
    mocks.viewport = 'desktop';
    const { getByTestId } = render(<RunEndScreen onRestart={() => {}} />);
    const screen = getByTestId('run-end-screen');
    expect(screen.getAttribute('data-viewport')).toBe('desktop');
    expect(screen.className).toBe('runend');
  });

  it('runend-screen has data-viewport="mobile" + mobile modifier class when useViewport returns mobile', () => {
    mocks.viewport = 'mobile';
    const { getByTestId } = render(<RunEndScreen onRestart={() => {}} />);
    const screen = getByTestId('run-end-screen');
    expect(screen.getAttribute('data-viewport')).toBe('mobile');
    expect(screen.className).toBe('runend mobile');
  });
});

describe('RunEndScreen — defensive null render when outcome is in_progress', () => {
  it('returns null (renders nothing) when outcome === "in_progress"', () => {
    mocks.ctxValue = makeCtx({ outcome: 'in_progress' });
    const { container } = render(<RunEndScreen onRestart={() => {}} />);
    expect(container.firstChild).toBeNull();
  });
});
