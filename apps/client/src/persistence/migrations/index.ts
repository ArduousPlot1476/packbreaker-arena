// Migration chain dispatcher. Routes a parsed-but-unmigrated payload
// (from packages/shared/src/save/storage.ts loadRaw()) to the current
// LocalSaveV1 shape based on the payload's schemaVersion field.
//
// 5b.3a ships v1 only — dispatcher routes to the identity migration.
// Future schema bumps add migration functions in vN.ts files and update
// the dispatcher's switch.
//
// Returns null when:
//   - parsed is not a plain object,
//   - schemaVersion is missing or unrecognized.
// Callers treat null as "no save / corrupt save" and proceed with a
// fresh-run path.

import type { LocalSaveV1 } from '@packbreaker/shared';
import { migrateV1Identity } from './v1';

export function migrate(parsed: unknown): LocalSaveV1 | null {
  if (typeof parsed !== 'object' || parsed === null) return null;
  const versioned = parsed as { schemaVersion?: unknown };
  if (versioned.schemaVersion === 1) {
    return migrateV1Identity(parsed as LocalSaveV1);
  }
  return null;
}
