// @packbreaker/shared — types crossing the client/server boundary.
//
// Surface (M1.1):
//   - TelemetryEvent (§ 15)            — telemetry/events.ts
//   - LocalSaveV1 / LocalSave (§ 13)   — save/index.ts
//   - GhostBuild (§ 12)                — ghost.ts
//
// API DTOs (§ 14: DailyContractResponse, TelemetryBatchRequest) defer to M1.5
// when apps/server gets its two endpoints — placeholder lives in api/index.ts.

export * from './api';
export * from './telemetry/events';
export * from './save';
export * from './ghost';
