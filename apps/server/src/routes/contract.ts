// GET /v1/contract/daily (M2 PR1).
//
// Serves today's daily contract (date + contract + date-stable seed). No
// request input to validate, so — as a GET-shaped adaptation of the CF-49
// pattern — the route validates its OWN constructed output against
// DailyContractResponseSchema before serving: a generator regression is a
// logged 500, never a malformed 200. This registrar closes the doc/code
// drift where tech-architecture.md § 6.1 listed this endpoint but it was
// never registered (only telemetry shipped in M1.5c).

import type { FastifyInstance } from 'fastify'
import { buildDailyContract } from '../contract/daily.js'
import { parseDailyContract } from '../validation/dailyContract.js'

export function registerDailyContractRoute(app: FastifyInstance): void {
  app.get('/v1/contract/daily', async (_request, reply) => {
    const response = buildDailyContract()
    const parsed = parseDailyContract(response)
    if (!parsed.success) {
      app.log.error(
        { issues: parsed.error.issues },
        'daily contract failed self-validation',
      )
      return reply.status(500).send({ error: 'contract_unavailable' })
    }
    return reply.status(200).send(response)
  })
}
