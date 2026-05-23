// Server environment configuration (M1.5c PR 2 / CF 49).
//
// Read once at process start. POSTHOG_PROJECT_KEY is required-or-warn:
// when unset, the server still boots and accepts telemetry batches
// (returns 204) but does NOT forward them to PostHog — the env-unset
// path is logged as a startup warning by posthog/client.ts. This
// mirrors the client's throw-safe posture (telemetry never blocks the
// app) and lets the server come up before PostHog is provisioned.
//
// Contract: readEnv NEVER throws. Every value that feeds a throwing
// consumer at boot is validated here and falls back to a documented
// default on anything invalid (Phase 2.5 r1 / Codex P2):
//   - PORT feeds app.listen(), which throws on a non-integer or
//     out-of-range port → strict all-digit parse + 1..65535 range.
//   - LOG_LEVEL feeds pino (bootstrap logger + Fastify's logger), which
//     throws on an unknown level → validate against pino's level set.
// (POSTHOG_PROJECT_KEY / POSTHOG_HOST feed posthog-node, which does not
// validate at construction and swallows flush failures — no boot throw,
// so empty-string fallback is sufficient there.)
//
// Pure reader: takes a ProcessEnv-shaped source (default process.env)
// so tests exercise the required/optional matrix without mutating the
// real environment.

/** Resolved, validated server configuration. */
export interface ServerEnv {
  /** PostHog project API key. `null` when unset → accept-but-no-forward. */
  readonly posthogProjectKey: string | null
  /** PostHog ingestion host. Default: US cloud (telemetry-plan.md § 11). */
  readonly posthogHost: string
  /** HTTP listen port. Default: 4000 (tech-architecture.md § 8.1). */
  readonly port: number
  /** Pino log level. Default: 'info'. */
  readonly logLevel: string
}

const DEFAULT_POSTHOG_HOST = 'https://us.i.posthog.com'
const DEFAULT_PORT = 4000
const DEFAULT_LOG_LEVEL = 'info'

/** Valid TCP port range for app.listen(). */
const MIN_PORT = 1
const MAX_PORT = 65535

/** pino's accepted level set (plus 'silent'). An unknown level throws at
 *  logger construction, so LOG_LEVEL is validated against this before it
 *  can reach pino / Fastify's logger. */
const VALID_LOG_LEVELS: ReadonlySet<string> = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
])

/** Strict port parse. Rejects (→ DEFAULT_PORT) anything that isn't an
 *  all-digit string in 1..65535: trailing garbage ('70000abc'), signs
 *  ('-1'), decimals, whitespace, empty, out-of-range (0, 70000). Uses a
 *  regex + Number (NOT parseInt, which accepts trailing garbage). */
function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.length === 0) return DEFAULT_PORT
  if (!/^\d+$/.test(raw)) return DEFAULT_PORT
  const port = Number(raw)
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    return DEFAULT_PORT
  }
  return port
}

/** Validates LOG_LEVEL against pino's level set; unknown → default. */
function parseLogLevel(raw: string | undefined): string {
  if (raw === undefined || raw.length === 0) return DEFAULT_LOG_LEVEL
  return VALID_LOG_LEVELS.has(raw) ? raw : DEFAULT_LOG_LEVEL
}

/** Reads server config from a ProcessEnv-shaped source. Never throws —
 *  every value feeding a throwing boot consumer is validated and falls
 *  back to a documented default on anything invalid. */
export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const rawKey = source.POSTHOG_PROJECT_KEY?.trim()
  const rawHost = source.POSTHOG_HOST?.trim()
  const rawPort = source.PORT?.trim()
  const rawLevel = source.LOG_LEVEL?.trim()

  return {
    posthogProjectKey: rawKey && rawKey.length > 0 ? rawKey : null,
    posthogHost: rawHost && rawHost.length > 0 ? rawHost : DEFAULT_POSTHOG_HOST,
    port: parsePort(rawPort),
    logLevel: parseLogLevel(rawLevel),
  }
}
