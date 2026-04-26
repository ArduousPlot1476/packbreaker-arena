// @packbreaker/shared/telemetry/events — telemetry event taxonomy.
//
// Canonical definition lives in @packbreaker/content (schemas.ts § 15).
// telemetry-plan.md § 3 owns the meaning. Re-exported here so client/server
// code can keep importing it from @packbreaker/shared per the original API
// surface.

export type { TelemetryEvent, TelemetryEventName } from '@packbreaker/content';
