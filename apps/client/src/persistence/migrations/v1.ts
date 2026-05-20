// v1 → v1 identity migration.
//
// Schema version 1 is the current LocalSaveV1 shape (content-schemas.ts
// § 13). This file holds the identity migration stub and documents the
// pattern for future schema bumps:
//
//   - LocalSaveV2 lands → author v2.ts with
//     `function migrateV1ToV2(v1: LocalSaveV1): LocalSaveV2`,
//     update apps/client/src/persistence/migrations/index.ts to dispatch
//     from schemaVersion=1 through the chain.
//   - LocalSaveV3 lands → v3.ts adds `migrateV2ToV3` etc. Migration
//     chain runs sequentially from the stored schemaVersion to the
//     current one.

import type { LocalSaveV1 } from '@packbreaker/shared';

export function migrateV1Identity(payload: LocalSaveV1): LocalSaveV1 {
  return payload;
}
