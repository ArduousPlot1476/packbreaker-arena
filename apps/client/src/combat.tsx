// Re-export shim. The canonical CombatOverlay implementation lives in
// combat/CombatOverlay.tsx as of M1.3.1 commit 5. This file persists
// only to keep the legacy App.tsx prototype monolith compiling until
// commit 10's prototype-cleanup step deletes both.

export { CombatOverlay } from './combat/CombatOverlay';
