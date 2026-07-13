// Zod validator for POST /v1/account/link (M2.1 PR2.5).
//
// Mirrors validation/telemetryBatch.ts: a standalone schema module +
// safeParse entrypoint; the route maps !success → 400 and .data → handler.
// Body carries only the device anonId to link (the account is identified
// server-side by the authenticated Clerk userId, never from the body).

import { z } from 'zod'

export const AccountLinkRequestSchema = z
  .object({
    anonId: z.string().uuid(),
  })
  .strict()

export type ParsedAccountLink = z.infer<typeof AccountLinkRequestSchema>

export function parseAccountLink(body: unknown) {
  return AccountLinkRequestSchema.safeParse(body)
}
