// Migration chain dispatcher. Routes a parsed-but-unmigrated payload
// (from apps/client/src/persistence/storage.ts loadRaw()) to the
// current LocalSaveV1 shape based on the payload's schemaVersion field.
//
// 5b.3a ships v1 only — dispatcher routes to the identity migration.
// Future schema bumps add migration functions in vN.ts files and update
// the dispatcher's switch.
//
// Phase 2.5h (Catch 22 / Class A): version routing alone is insufficient
// — a schemaVersion===1 payload with arbitrary garbage inside would pass
// the dispatcher's cast and throw downstream on field access (restoreRun
// relics deref, constructor's history.slice, reducer arm's .map). The
// per-version validator (../validate.ts) is applied after version
// routing; structural mismatches return null.
//
// Returns null when:
//   - parsed is not a plain object,
//   - schemaVersion is missing or unrecognized,
//   - the routed payload fails the per-version shape validator.
// Callers treat null as "no save / corrupt save" and proceed with a
// fresh-run path.

import type { LocalSaveV1 } from '@packbreaker/shared';
import { migrateV1Identity } from './v1';
import { validateLocalSaveV1 } from '../validate';

export function migrate(parsed: unknown): LocalSaveV1 | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const versioned = parsed as { schemaVersion?: unknown };
  if (versioned.schemaVersion === 1) {
    // validateLocalSaveV1 is a `parsed is LocalSaveV1` type predicate —
    // a true return narrows `parsed` to LocalSaveV1 in this branch, so
    // migrateV1Identity can receive it without a structural cast.
    if (!validateLocalSaveV1(parsed)) return null;
    return migrateV1Identity(parsed);
  }
  return null;
}
