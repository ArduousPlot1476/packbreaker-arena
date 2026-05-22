// Vitest setup: register @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.) and clean up the DOM
// between tests via @testing-library/react's afterEach hook.
//
// M1.5b PR 3 / 5b.3a Commit 5: also clear localStorage between tests.
// useRun's load-on-mount useEffect reads from localStorage; without a
// reset, a save written by one test would be restored by the next
// test's RunProvider mount and bypass the class-select gate. Tests
// that need to seed the save explicitly call localStorage.setItem(...)
// in their setup (round-trip suite in 5b.3a Commit 6).
//
// M1.5b PR 3 / 5b.3b Phase 2.5 round 2: bump
// @testing-library/dom's default asyncUtilTimeout from 1000ms → 3000ms.
// Several tests (abandon-flow + AbandonRunMenu confirm + abandonRun
// integration) assert on RunEndScreen mounting via the React.lazy
// boundary in RunContext.tsx after dispatching abandon_run. The
// dynamic-import resolution is timing-sensitive under default vitest
// concurrency: tests pass in isolation and under --pool=forks
// --singleFork but flake at the 1000ms default when the full 29-file
// suite contends for the worker pool. The lazy boundary is a real
// runtime cost; 3000ms is the project's apparent budget for it (no
// individual test should legitimately wait that long on its own).

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup, configure as configureTL } from '@testing-library/react';

configureTL({ asyncUtilTimeout: 3000 });

afterEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});
