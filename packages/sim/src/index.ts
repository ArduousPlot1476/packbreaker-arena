// @packbreaker/sim — pure-TS deterministic combat simulator.
//
// M1.1 stub. Populated in M1.2 with mulberry32 RNG, integer-tick combat
// resolution, and the simulateCombat / replayCombat API per
// tech-architecture.md § 4.2.
//
// Invariants the lint config enforces today, before any sim code lands:
//   - no DOM globals (window, document, localStorage, sessionStorage)
//   - no Math.random, no Date.now, no `new Date()`
//   - no Node built-ins (fs, path, os, crypto)
//   - no React / Phaser
//   - no @packbreaker/shared (shared types are content/sim-agnostic)
//   - no read of Item.passiveStats (run-controller-only field per content-schemas.ts § 0)
export {};
