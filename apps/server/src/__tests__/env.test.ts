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
    expect(env.databaseUrl).toBeNull()
    expect(env.clerkSecretKey).toBeNull()
  })

  it('reads provided values', () => {
    const env = readEnv({
      POSTHOG_PROJECT_KEY: 'phc_abc',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
      PORT: '8080',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://user:pass@host:5432/db',
      CLERK_SECRET_KEY: 'sk_test_x',
    })
    expect(env.posthogProjectKey).toBe('phc_abc')
    expect(env.posthogHost).toBe('https://eu.i.posthog.com')
    expect(env.port).toBe(8080)
    expect(env.logLevel).toBe('debug')
    expect(env.databaseUrl).toBe('postgresql://user:pass@host:5432/db')
    expect(env.clerkSecretKey).toBe('sk_test_x')
  })

  it('treats a blank project key as null', () => {
    expect(readEnv({ POSTHOG_PROJECT_KEY: '   ' }).posthogProjectKey).toBeNull()
  })

  it('treats a blank DATABASE_URL / CLERK_SECRET_KEY as null', () => {
    expect(readEnv({ DATABASE_URL: '   ' }).databaseUrl).toBeNull()
    expect(readEnv({ CLERK_SECRET_KEY: '  ' }).clerkSecretKey).toBeNull()
  })

  it('falls back to default port on an unparseable PORT', () => {
    expect(readEnv({ PORT: 'not-a-number' }).port).toBe(4000)
  })

  // Phase 2.5 r1 / Codex P2: PORT feeds app.listen() which throws on a
  // non-integer or out-of-range port. Every invalid form → DEFAULT_PORT,
  // never a throw.
  describe('PORT hardening (never reaches listen() invalid)', () => {
    it.each([
      ['out-of-range high', '70000', 4000],
      ['trailing garbage', '70000abc', 4000],
      ['zero', '0', 4000],
      ['negative', '-1', 4000],
      ['empty string', '', 4000],
      ['whitespace only', '   ', 4000],
      ['decimal', '8080.5', 4000],
      ['leading-plus', '+8080', 4000],
    ])('%s (%j) → default %i', (_label, value, expected) => {
      expect(readEnv({ PORT: value }).port).toBe(expected)
    })

    it('passes through a valid in-range port', () => {
      expect(readEnv({ PORT: '8080' }).port).toBe(8080)
      expect(readEnv({ PORT: '1' }).port).toBe(1)
      expect(readEnv({ PORT: '65535' }).port).toBe(65535)
    })
  })

  // Phase 2.5 r1 / Codex P2: LOG_LEVEL feeds pino, which throws on an
  // unknown level. Invalid → default; valid pino levels pass through.
  describe('LOG_LEVEL hardening (never reaches pino invalid)', () => {
    it('falls back to default on an unknown level', () => {
      expect(readEnv({ LOG_LEVEL: 'bogus' }).logLevel).toBe('info')
      expect(readEnv({ LOG_LEVEL: 'verbose' }).logLevel).toBe('info')
    })

    it.each(['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'])(
      'passes through valid level %s',
      (level) => {
        expect(readEnv({ LOG_LEVEL: level }).logLevel).toBe(level)
      },
    )
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
