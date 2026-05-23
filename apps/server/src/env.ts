// Server environment configuration (M1.5c PR 2 / CF 49).
//
// Read once at process start. POSTHOG_PROJECT_KEY is required-or-warn:
// when unset, the server still boots and accepts telemetry batches
// (returns 204) but does NOT forward them to PostHog — the env-unset
// path is logged as a startup warning by posthog/client.ts. This
// mirrors the client's throw-safe posture (telemetry never blocks the
// app) and lets the server come up before PostHog is provisioned.
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

/** Reads server config from a ProcessEnv-shaped source. Never throws —
 *  absent/blank values fall back to defaults; an unparseable PORT falls
 *  back to the default rather than crashing boot. */
export function readEnv(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const rawKey = source.POSTHOG_PROJECT_KEY?.trim()
  const rawHost = source.POSTHOG_HOST?.trim()
  const rawPort = source.PORT?.trim()
  const rawLevel = source.LOG_LEVEL?.trim()

  const parsedPort = rawPort ? Number.parseInt(rawPort, 10) : NaN

  return {
    posthogProjectKey: rawKey && rawKey.length > 0 ? rawKey : null,
    posthogHost: rawHost && rawHost.length > 0 ? rawHost : DEFAULT_POSTHOG_HOST,
    port: Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT,
    logLevel: rawLevel && rawLevel.length > 0 ? rawLevel : DEFAULT_LOG_LEVEL,
  }
}
