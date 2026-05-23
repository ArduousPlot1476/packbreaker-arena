// env.ts + posthog/client.ts matrix (M1.5c PR 2 / CF 49).
//
// posthog-node is mocked so the key-set path constructs a network-free
// fake (no real PostHog timers/HTTP in the test process).

import { describe, expect, it, vi } from 'vitest'

vi.mock('posthog-node', () => ({
  PostHog: class {
    capture(): void {}
    async shutdown(): Promise<void> {}
  },
}))

import { readEnv } from '../env.js'
import { createPosthogSink } from '../posthog/client.js'

describe('readEnv', () => {
  it('defaults when nothing is set', () => {
    const env = readEnv({})
    expect(env.posthogProjectKey).toBeNull()
    expect(env.posthogHost).toBe('https://us.i.posthog.com')
    expect(env.port).toBe(4000)
    expect(env.logLevel).toBe('info')
  })

  it('reads provided values', () => {
    const env = readEnv({
      POSTHOG_PROJECT_KEY: 'phc_abc',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
      PORT: '8080',
      LOG_LEVEL: 'debug',
    })
    expect(env.posthogProjectKey).toBe('phc_abc')
    expect(env.posthogHost).toBe('https://eu.i.posthog.com')
    expect(env.port).toBe(8080)
    expect(env.logLevel).toBe('debug')
  })

  it('treats a blank project key as null', () => {
    expect(readEnv({ POSTHOG_PROJECT_KEY: '   ' }).posthogProjectKey).toBeNull()
  })

  it('falls back to default port on an unparseable PORT', () => {
    expect(readEnv({ PORT: 'not-a-number' }).port).toBe(4000)
  })
})

describe('createPosthogSink', () => {
  it('unset key → null sink + one warn (accept-but-no-forward)', () => {
    const warns: string[] = []
    const sink = createPosthogSink(
      { projectKey: null, host: 'https://us.i.posthog.com' },
      { warn: (m) => warns.push(m) },
    )
    expect(sink).toBeNull()
    expect(warns).toHaveLength(1)
    expect(warns[0]).toContain('POSTHOG_PROJECT_KEY')
  })

  it('set key → non-null sink with capture+shutdown, no warn', () => {
    const warns: string[] = []
    const sink = createPosthogSink(
      { projectKey: 'phc_abc', host: 'https://us.i.posthog.com' },
      { warn: (m) => warns.push(m) },
    )
    expect(sink).not.toBeNull()
    expect(typeof sink!.capture).toBe('function')
    expect(typeof sink!.shutdown).toBe('function')
    expect(warns).toHaveLength(0)
  })
})
