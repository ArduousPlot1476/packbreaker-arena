// Daily contract generator + GET /v1/contract/daily (M2 PR1).

import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { buildDailyContract, seedForDate } from '../contract/daily.js'
import { parseDailyContract } from '../validation/dailyContract.js'

describe('buildDailyContract', () => {
  it('is deterministic for a fixed clock and yields a valid DTO', () => {
    const now = (): Date => new Date('2026-07-13T12:34:56.000Z')
    const a = buildDailyContract(now)
    const b = buildDailyContract(now)
    expect(a).toEqual(b)
    expect(a.date).toBe('2026-07-13')
    expect(a.contractId).toBe('daily-placeholder')
    expect(a.contract.isDaily).toBe(true)
    expect(parseDailyContract(a).success).toBe(true)
  })
})

describe('seedForDate', () => {
  it('is stable per date and varies across dates', () => {
    expect(seedForDate('2026-07-13')).toBe(seedForDate('2026-07-13'))
    expect(seedForDate('2026-07-13')).not.toBe(seedForDate('2026-07-14'))
  })

  it('returns an unsigned 32-bit integer', () => {
    const seed = seedForDate('2026-07-13')
    expect(Number.isInteger(seed)).toBe(true)
    expect(seed).toBeGreaterThanOrEqual(0)
    expect(seed).toBeLessThanOrEqual(0xffffffff)
  })
})

describe('GET /v1/contract/daily', () => {
  let app: FastifyInstance | null = null

  afterEach(async () => {
    if (app) {
      await app.close()
      app = null
    }
  })

  it('returns 200 with a valid DailyContractResponse', async () => {
    app = createApp({ posthog: null, logLevel: 'silent' })
    const res = await app.inject({ method: 'GET', url: '/v1/contract/daily' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(parseDailyContract(body).success).toBe(true)
    expect(body.contractId).toBe('daily-placeholder')
    expect(body.contract.isDaily).toBe(true)
    expect(typeof body.seed).toBe('number')
  })
})
