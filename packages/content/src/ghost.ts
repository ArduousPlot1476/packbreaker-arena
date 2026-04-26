// @packbreaker/content/ghost — GhostBuild type.
//
// DEVIATION from content-schemas.ts § 0 / § 12 (which puts GhostBuild in
// packages/shared) and from spec phase 5 step 8 (which asks boss.ts to import
// GhostBuild from @packbreaker/shared).
//
// Why moved: GhostBuild references content schema types (BagState, RelicSlots,
// ClassId, GhostId, etc.). Putting GhostBuild in shared forces shared → content.
// Shared also imports from content for TelemetryEvent (§ 15) and LocalSaveV1
// (§ 13). Combined with content → shared for GhostBuild, we get a cyclic
// workspace dependency that turbo refuses to build.
//
// Resolution: GhostBuild lives in content (one direction: shared → content
// only). @packbreaker/shared/ghost re-exports the type so client/server can
// keep importing it from shared per the original API surface.

import type {
  BagState,
  ClassId,
  GhostId,
  IsoTimestamp,
  RelicSlots,
  RoundNumber,
  SimSeed,
} from './schemas';

export interface GhostBuild {
  readonly id: GhostId;
  readonly classId: ClassId;
  readonly bag: BagState;
  readonly relics: RelicSlots;
  readonly recordedRound: RoundNumber;
  readonly trophyAtRecord: number;
  readonly seed: SimSeed;
  readonly submittedAt: IsoTimestamp;
  readonly source: 'player' | 'bot';
}
