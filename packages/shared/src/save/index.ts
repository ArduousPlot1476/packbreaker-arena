// @packbreaker/shared/save — local persistence schema (types-only).
//
// Canonical definition lives in @packbreaker/content (schemas.ts § 13).
// Re-exported here so client/server code can keep importing it from
// @packbreaker/shared per the original API surface.
//
// Layering: the apps/server package imports @packbreaker/shared for
// types crossing the client/server boundary, so this module must stay
// types-only — no runtime, no platform-global access (window /
// localStorage / globalThis). The M1 LocalSave runtime primitives
// (save / loadRaw / clearSave + SaveStorageAdapter) live in the client
// tier at apps/client/src/persistence/storage.ts (relocated during the
// 5b.3a pre-push gate-clearance pass per Catch 19 / Option 1).

export type { LocalSaveV1, LocalSave, SerializedRunState } from '@packbreaker/content';
