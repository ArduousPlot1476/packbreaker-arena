// @packbreaker/shared/ghost — GhostBuild re-export.
//
// GhostBuild's canonical definition lives in @packbreaker/content (deviation
// from content-schemas.ts § 12 — see packages/content/src/ghost.ts for the
// rationale). Re-exporting here preserves the original API surface so client
// and server code can keep importing it from @packbreaker/shared.

export type { GhostBuild } from '@packbreaker/content';
