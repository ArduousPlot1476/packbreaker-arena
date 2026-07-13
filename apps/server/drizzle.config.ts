// Drizzle Kit config (M2 PR1).
//
// `generate` reads ./src/db/schema.ts and emits SQL migrations into
// ./drizzle — this works OFFLINE (no database needed). `migrate`/`push`
// (which DO need a live connection) read DATABASE_URL from the env; per
// the Phase 1 "build offline" decision those are deferred until a
// DATABASE_URL is provisioned. Not compiled by tsc (outside src/) and not
// linted (*.config.ts is in the eslint ignore list).

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
})
