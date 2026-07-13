// Minimal logger shape shared by the DI-seam constructors (M2 PR1).
//
// pino (the bootstrap logger) and Fastify's logger both satisfy this
// structurally. Kept narrow so seam factories can warn at boot without
// depending on a concrete logger. (posthog/client.ts predates this and
// carries its own structurally-identical WarnLogger — left untouched to
// avoid churning CF-49 code for a cosmetic dedupe.)

export interface WarnLogger {
  warn(msg: string): void
}
