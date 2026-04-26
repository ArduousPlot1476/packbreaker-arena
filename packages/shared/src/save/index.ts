// @packbreaker/shared/save — local persistence schema.
//
// Verbatim port of content-schemas.ts § 13 LocalSaveV1.
// Versioned from day one. Migrations live in apps/client/src/persistence/migrations/.

import type { IsoDate, RunState } from '@packbreaker/content';

export interface LocalSaveV1 {
  readonly schemaVersion: 1;
  readonly trophies: number;
  readonly dailyStreak: number;
  readonly lastDailyAttempted: IsoDate | null;
  readonly tutorialCompleted: boolean;
  readonly telemetryAnonId: string;
  readonly inProgressRun: RunState | null;
}

export type LocalSave = LocalSaveV1;
