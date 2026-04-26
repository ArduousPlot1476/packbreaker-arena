// @packbreaker/shared/api — server request/response DTOs.
//
// Canonical definitions live in @packbreaker/content (schemas.ts § 14).
// Re-exported here so client/server can keep importing them from
// @packbreaker/shared. apps/server populates real handlers in M1.5
// (per tech-architecture.md § 6.1).

export type { DailyContractResponse, TelemetryBatchRequest } from '@packbreaker/content';
