// Top-level screen router: title vs game.
//
// This layer did not exist. main.tsx rendered <RunScreen/> directly, so the app
// booted into class select with no name, no settings, and no way to distinguish
// resuming a run from starting one (gdd.md § 14.1, CF 69).
//
// Deliberately NOT a router library. There are two states, no URLs to own, and
// the game is a single-screen experience — RunContext already does conditional
// rendering for class-select / in-run / run-end below this. Adding react-router
// for one boolean would be weight the bundle budget in tech-architecture.md § 10
// has no reason to carry.
//
// KNOWN GAP: there is no return-to-title from inside a run. The natural home is
// the AbandonRunMenu's ⋯ menu, which already owns "leave this run", and putting
// it there needs prop threading through RunScreen. Reload returns to the title
// in the meantime.

import { useCallback, useState } from 'react';
import { RunScreen } from './screens/RunScreen';
import { TitleScreen } from './screens/TitleScreen';
import { clearLocal } from './persistence';

type Screen = 'title' | 'game';

export function AppShell() {
  const [screen, setScreen] = useState<Screen>('title');

  const handleContinue = useCallback(() => {
    // RunContext restores the saved run itself on mount — leave storage alone.
    setScreen('game');
  }, []);

  const handleNewRun = useCallback(() => {
    // Clear FIRST, then mount: the restore effect runs at mount, so clearing
    // after would race it and resume the run the player just chose to discard.
    try {
      clearLocal();
    } catch {
      // Storage denied — the run screen still opens; worst case the old run
      // resumes, which is recoverable from in-game.
    }
    setScreen('game');
  }, []);

  if (screen === 'title') {
    return <TitleScreen onNewRun={handleNewRun} onContinue={handleContinue} />;
  }
  return <RunScreen />;
}
