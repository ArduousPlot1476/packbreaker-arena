// koFlash.test.ts — CF-84 round-3 P3: the terminal KO flash must be honest.
// A decisive win flashes EXACTLY the loser's portrait; a mutual-KO draw flashes
// BOTH (both combatants died). The draw case is RED against the previous two-way
// branch (player_win → ghost, else → player), which flashed only the player.

import { describe, expect, it } from 'vitest';
import { koFlashTargets } from './koFlash';

describe('koFlashTargets — honest KO flash (CF-84 round-3 P3)', () => {
  it('player_win flashes exactly the ghost', () => {
    expect([...koFlashTargets('player_win')]).toEqual(['ghost']);
  });

  it('ghost_win flashes exactly the player', () => {
    expect([...koFlashTargets('ghost_win')]).toEqual(['player']);
  });

  it('a draw flashes BOTH portraits (both died) — RED under the old two-way branch', () => {
    const targets = koFlashTargets('draw');
    expect(targets.length).toBe(2);
    expect([...targets].sort()).toEqual(['ghost', 'player']);
  });

  it('a decisive win flashes exactly ONE portrait (the mirror that must not break)', () => {
    expect(koFlashTargets('player_win').length).toBe(1);
    expect(koFlashTargets('ghost_win').length).toBe(1);
  });
});
