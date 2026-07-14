// Zod validator for POST /v1/account/link (M2.1 PR2.5).
//
// Mirrors validation/telemetryBatch.ts: a standalone schema module +
// safeParse entrypoint; the route maps !success → 400 and .data → handler.
// Body carries only the device anonId to link (the account is identified
// server-side by the authenticated Clerk userId, never from the body).
//
// anonId contract: NON-EMPTY STRING (`.min(1)`), matching telemetryBatch's
// anonId + LocalSaveV1.telemetryAnonId. NOT `.uuid()` — the client anonId
// generator (identifiers.ts) has a live non-UUID `fallback-…` path, and
// the whole system validates anonId as a plain string; a stricter uuid()
// here would 400 those legacy/fallback ids and never link them. (CF-51's
// telemetry-side uuid tightening is separate + hasn't fired.)

import { z } from 'zod'

export const AccountLinkRequestSchema = z
  .object({
    anonId: z.string().min(1),
  })
  .strict()

export type ParsedAccountLink = z.infer<typeof AccountLinkRequestSchema>

export function parseAccountLink(body: unknown) {
  return AccountLinkRequestSchema.safeParse(body)
}
