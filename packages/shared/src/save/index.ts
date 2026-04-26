// @packbreaker/shared/save — local persistence schema.
//
// Canonical definition lives in @packbreaker/content (schemas.ts § 13).
// Re-exported here so client/server code can keep importing it from
// @packbreaker/shared per the original API surface.

export type { LocalSaveV1, LocalSave } from '@packbreaker/content';
