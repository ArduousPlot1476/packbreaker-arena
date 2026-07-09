// Loads Vite client type augmentation so `import.meta.env.DEV` (and
// other Vite env literals) typecheck. Runtime substitution is handled
// by Vite at build time per its documented constant-folding behavior;
// this file is type-only.

/// <reference types="vite/client" />

/** Injected by the `define` block in vite.config.ts (CF 54):
 *  `<pkg.version>+<git short SHA>`, e.g. "0.0.1+c0cd79d". Guard reads with
 *  `typeof __CLIENT_VERSION__ !== 'undefined'` — plain tsc and non-Vite
 *  runners don't perform the substitution. */
declare const __CLIENT_VERSION__: string;
