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

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') {
    localStorage.clear();
  }
});
