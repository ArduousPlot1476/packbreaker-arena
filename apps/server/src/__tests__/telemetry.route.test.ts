// Route integration tests via fastify.inject() (M1.5c PR 2 / CF 49).
// No live network — the sink is the in-memory fake from helpers.ts.

import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createApp } from '../app.js'
import type { TelemetrySink } from '../posthog/client.js'
import {
  SESSION_ID,
  TS_CLIENT,
  allVariantPayloads,
  makeBatch,
  makeFakeSink,
} from './helpers.js'

let app: FastifyInstance | null = null

afterEach(async () => {
  if (app !== null) {
    await app.close()
    app = null
  }
})

function inject(payload: unknown) {
  return app!.inject({
    method: 'POST',
    url: '/v1/telemetry/batch',
    headers: { 'content-type': 'application/json' },
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
  })
}

describe('POST /v1/telemetry/batch — happy path', () => {
  it('accepts a client-shaped mixed batch (204) and maps every event', async () => {
    const fake = makeFakeSink()
    app = createApp({ posthog: fake.sink, logLevel: 'silent' })

    const events = [
      { tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'run_start', runId: 'run-1', classId: 'tinker', contractId: 'neutral', seed: 12345, startingRelicId: 'iron_will' },
      { tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'run_end', runId: 'run-1', outcome: 'abandoned', roundReached: 5, heartsRemaining: 2 },
      { tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'combat_end', runId: 'run-1', round: 3, outcome: 'player_win', endedAtTick: 120, damageDealt: 40, damageTaken: 12 },
    ]
    const res = await inject(makeBatch(events, { anonId: 'anon-xyz', clientVersion: 'm1.5c-pr1' }))

    expect(res.statusCode).toBe(204)
    expect(res.body).toBe('')
    expect(fake.captures).toHaveLength(3)

    const runStart = fake.captures[0]!
    expect(runStart.distinctId).toBe('anon-xyz')
    expect(runStart.event).toBe('run_start')
    // properties = (event minus name) + clientVersion + tsServer
    expect(runStart.properties.name).toBeUndefined()
    expect(runStart.properties.clientVersion).toBe('m1.5c-pr1')
    expect(runStart.properties.tsClient).toBe(TS_CLIENT)
    expect(runStart.properties.sessionId).toBe(SESSION_ID)
    expect(runStart.properties.runId).toBe('run-1')
    expect(runStart.properties.startingRelicId).toBe('iron_will')
    expect(typeof runStart.properties.tsServer).toBe('string')
    // timestamp ← tsClient
    expect(runStart.timestamp).toBeInstanceOf(Date)
    expect((runStart.timestamp as Date).toISOString()).toBe(TS_CLIENT)

    expect(fake.captures[1]!.event).toBe('run_end')
    expect(fake.captures[1]!.properties.outcome).toBe('abandoned')
    expect(fake.captures[2]!.event).toBe('combat_end')
  })
})

describe('POST /v1/telemetry/batch — per-variant round-trip (exhaustiveness)', () => {
  // Each full canonical payload through the strict schema. Doubles as the
  // dropped-property runtime gate: a dropped field on any variant would
  // become an unknown key on the full payload → strict rejects → 400 here.
  for (const payload of allVariantPayloads()) {
    it(`accepts ${String(payload.name)}`, async () => {
      const fake = makeFakeSink()
      app = createApp({ posthog: fake.sink, logLevel: 'silent' })
      const res = await inject(makeBatch([payload]))
      expect(res.statusCode).toBe(204)
      expect(fake.captures).toHaveLength(1)
      expect(fake.captures[0]!.event).toBe(payload.name)
    })
  }

  it('forwards all 20 variants in a single batch', async () => {
    const fake = makeFakeSink()
    app = createApp({ posthog: fake.sink, logLevel: 'silent' })
    const all = allVariantPayloads()
    const res = await inject(makeBatch(all))
    expect(res.statusCode).toBe(204)
    expect(fake.captures).toHaveLength(20)
    expect(fake.captures.map((c) => c.event)).toEqual(all.map((p) => p.name))
  })
})

describe('POST /v1/telemetry/batch — validation 400s', () => {
  function freshFake() {
    const fake = makeFakeSink()
    app = createApp({ posthog: fake.sink, logLevel: 'silent' })
    return fake
  }

  it('rejects missing anonId', async () => {
    const fake = freshFake()
    const res = await inject({ clientVersion: 'm1.5c-pr1', events: allVariantPayloads().slice(0, 1) })
    expect(res.statusCode).toBe(400)
    expect(fake.captures).toHaveLength(0)
  })

  it('rejects empty events array', async () => {
    const fake = freshFake()
    const res = await inject(makeBatch([]))
    expect(res.statusCode).toBe(400)
    expect(fake.captures).toHaveLength(0)
  })

  it('rejects an unknown variant name', async () => {
    const fake = freshFake()
    const res = await inject(makeBatch([{ tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'bogus_event' }]))
    expect(res.statusCode).toBe(400)
    expect(fake.captures).toHaveLength(0)
  })

  it('rejects a variant missing a required property (run_start without seed)', async () => {
    const fake = freshFake()
    const res = await inject(makeBatch([{ tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'run_start', runId: 'run-1', classId: 'tinker', contractId: 'neutral', startingRelicId: 'iron_will' }]))
    expect(res.statusCode).toBe(400)
    expect(fake.captures).toHaveLength(0)
  })

  it('rejects an unknown extra key on a variant (strict, no passthrough)', async () => {
    const fake = freshFake()
    const res = await inject(makeBatch([{ tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'tutorial_completed', surprise: 1 }]))
    expect(res.statusCode).toBe(400)
    expect(fake.captures).toHaveLength(0)
  })

  it('rejects a wrong literal-union value (round_end outcome=draw)', async () => {
    const fake = freshFake()
    const res = await inject(makeBatch([{ tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'round_end', runId: 'run-1', round: 3, outcome: 'draw', damageDealt: 1, damageTaken: 1 }]))
    expect(res.statusCode).toBe(400)
    expect(fake.captures).toHaveLength(0)
  })

  it('rejects malformed JSON', async () => {
    freshFake()
    const res = await inject('{ not valid json')
    expect(res.statusCode).toBe(400)
  })
})

describe('POST /v1/telemetry/batch — body limit (413)', () => {
  it('returns 413 when the body exceeds bodyLimit', async () => {
    const fake = makeFakeSink()
    app = createApp({ posthog: fake.sink, logLevel: 'silent', bodyLimit: 512 })
    const oversize = makeBatch([{ tsClient: TS_CLIENT, sessionId: SESSION_ID, name: 'tutorial_step_reached', stepId: 'x'.repeat(2000) }])
    const res = await inject(oversize)
    expect(res.statusCode).toBe(413)
    expect(fake.captures).toHaveLength(0)
  })
})

describe('POST /v1/telemetry/batch — env-unset (null sink)', () => {
  it('accepts the batch (204) and forwards nothing', async () => {
    app = createApp({ posthog: null, logLevel: 'silent' })
    const res = await inject(makeBatch(allVariantPayloads().slice(0, 3)))
    expect(res.statusCode).toBe(204)
  })
})

describe('POST /v1/telemetry/batch — forward failure (500)', () => {
  it('returns 500 (handled, not propagated) when capture() throws', async () => {
    const throwingSink: TelemetrySink = {
      capture() {
        throw new Error('boom')
      },
      async shutdown() {},
    }
    app = createApp({ posthog: throwingSink, logLevel: 'silent' })
    const res = await inject(makeBatch(allVariantPayloads().slice(0, 1)))
    expect(res.statusCode).toBe(500)
    // The forward_failed body proves OUR catch handled the throw (logged
    // + 500 in the same block, routes/telemetry.ts) rather than it
    // escaping to Fastify's generic error handler. The log line and the
    // 500 send are sequential in that catch, so a forward_failed response
    // transitively confirms the throw was logged, not propagated.
    expect(JSON.parse(res.body)).toEqual({ error: 'forward_failed' })
  })
})

describe('graceful shutdown', () => {
  it('app.close() drains the sink (onClose → shutdown)', async () => {
    const fake = makeFakeSink()
    app = createApp({ posthog: fake.sink, logLevel: 'silent' })
    await app.ready()
    await app.close()
    expect(fake.shutdownCount()).toBe(1)
    app = null
  })

  it('app.close() with a null sink does not throw', async () => {
    app = createApp({ posthog: null, logLevel: 'silent' })
    await app.ready()
    await expect(app.close()).resolves.toBeUndefined()
    app = null
  })
})
