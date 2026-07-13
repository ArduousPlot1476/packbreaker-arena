// Daily contract response validation (M2 PR1).
//
// Mirrors the CF-49 Zod-module pattern (validation/telemetryBatch.ts). A
// GET has no request body to validate, so this schema guards the route's
// OWN output: buildDailyContract() is validated before it is served, so a
// generator regression surfaces as a logged 500 rather than a malformed
// 200. The schema mirrors DailyContractResponse (content-schemas.ts § 14);
// branded types erase to their primitives on the wire, so the checks are
// on the underlying string/number. The nested `contract` is checked
// shallowly (identity fields + presence of `ruleset`) rather than
// re-deriving the whole content Ruleset here — it is package-typed data,
// not untrusted input, so re-enumerating it would only invite drift.

import { z } from 'zod'

const ContractSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  ruleset: z.unknown(),
  isDaily: z.boolean(),
})

export const DailyContractResponseSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    contractId: z.string().min(1),
    contract: ContractSchema,
    seed: z.number().int().nonnegative(),
  })
  .strict()

/** Validates a constructed daily response before it is served. */
export function parseDailyContract(value: unknown) {
  return DailyContractResponseSchema.safeParse(value)
}
