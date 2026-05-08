// Loads Vite client type augmentation so `import.meta.env.DEV` (and
// other Vite env literals) typecheck. Runtime substitution is handled
// by Vite at build time per its documented constant-folding behavior;
// this file is type-only.

/// <reference types="vite/client" />
