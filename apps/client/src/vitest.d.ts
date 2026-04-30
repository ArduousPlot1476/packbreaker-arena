// Loads @testing-library/jest-dom matcher type augmentation so
// expect(...).toBeInTheDocument(), .toHaveTextContent(), .toBeDisabled()
// etc. typecheck inside the colocated *.test.tsx files. The runtime
// registration happens in test/setup.ts.

/// <reference types="@testing-library/jest-dom" />
