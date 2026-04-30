// Historical entry point. The decomposed implementation lives at
// screens/RunScreen.tsx; M1.3.1 commit 5 cut main.tsx over to render
// RunScreen directly. This file persists as a re-export shim until
// commit 10's prototype-cleanup step deletes it alongside data.local.ts
// and combat.tsx.

export { RunScreen as App } from './screens/RunScreen';
