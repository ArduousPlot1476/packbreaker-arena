// Vitest setup: register @testing-library/jest-dom matchers
// (toBeInTheDocument, toHaveTextContent, etc.) and clean up the DOM
// between tests via @testing-library/react's afterEach hook.

import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
