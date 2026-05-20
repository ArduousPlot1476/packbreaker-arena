// @packbreaker/shared/save — local persistence schema + storage primitives.
//
// Canonical type definitions live in @packbreaker/content (schemas.ts § 13).
// Re-exported here so client/server code can keep importing them from
// @packbreaker/shared per the original API surface.
//
// M1.5b PR 3 / 5b.3a Commit 4 added storage primitives in storage.ts.
// Migration chain for future schemaVersion bumps lives in
// apps/client/src/persistence/migrations/ (client-side because migrations
// may need access to client-only state shape during upgrade).

export type { LocalSaveV1, LocalSave, SerializedRunState } from '@packbreaker/content';
export type { SaveStorageAdapter } from './storage';
export { save, loadRaw, clearSave, SAVE_STORAGE_KEY } from './storage';
