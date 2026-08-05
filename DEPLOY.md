# Deploying Packbreaker Arena

The game has never been hosted. This is the runbook for the first deploy, and
the config it refers to is committed — `vercel.json`, `apps/server/Dockerfile`,
`apps/server/fly.toml`.

**The client works without the server.** Clerk is optional (unset key →
anonymous play), and telemetry failures are swallowed at the transport. So the
client can go up on its own and be a complete, playable, shareable game. The
server only adds cross-device saves, accounts, and analytics. Ship the client
first; the server is not on the critical path to a link you can send someone.

---

## 1. Client → Vercel

```sh
npm i -g vercel      # once
vercel login
vercel link          # from the repo root; creates .vercel/ (gitignored)
vercel --prod
```

`vercel.json` at the repo root already sets the monorepo build:

- **Build**: `corepack enable && pnpm install --frozen-lockfile && pnpm --filter @packbreaker/client run build`
- **Output**: `apps/client/dist`
- **SPA rewrite**: everything except `/v1/*` falls through to `index.html`. The
  `/v1/` exclusion matters — without it a future API rewrite would be swallowed
  by the SPA fallback and return HTML to a fetch.
- **Caching**: hashed `/assets/*` immutable for a year, `index.html` no-cache.

### Environment

| Variable | Needed? | Notes |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Optional | Unset → anonymous-only, no sign-in UI. Set it only when the server is also up; a sign-in that can't reach an API is worse than no sign-in. |

**The build must run inside a git checkout.** `vite.config.ts` stamps
`clientVersion` from `git rev-parse --short HEAD` at build time, and falls back
to `local` when git is absent — which would put every production session into
one unattributable telemetry bucket. Vercel's default checkout satisfies this.

---

## 2. Server → Fly.io (optional, later)

```sh
fly launch --config apps/server/fly.toml --dockerfile apps/server/Dockerfile --no-deploy
fly secrets set DATABASE_URL="postgres://…" CLERK_SECRET_KEY="sk_…"
fly deploy --config apps/server/fly.toml --dockerfile apps/server/Dockerfile .
```

Deploy from the **repo root** (the trailing `.`) — the Dockerfile copies
workspace packages, so the build context must be the whole monorepo.

| Variable | Needed? | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Neon Postgres. Run the Drizzle migrations in `apps/server/drizzle/` against it first. |
| `CLERK_SECRET_KEY` | Yes | Clerk backend key. |
| `POSTHOG_PROJECT_KEY` / `POSTHOG_HOST` | Optional | Telemetry forwarding no-ops without them. |
| `PORT` | Preset | 4000, set in `fly.toml`. |

Node 20 in the Dockerfile matches `.nvmrc` and CI. Don't bump one without the
others — that skew is how a Node-22-only API reaches production green from a dev
machine running 22.

### Pointing the client at the server

The client calls relative `/v1/*` paths. Same-origin needs no config; a separate
API host needs a Vercel rewrite from `/v1/(.*)` to the Fly app. Add it to
`vercel.json` when the server actually goes up — it is deliberately absent now
so the client doesn't rewrite to a host that doesn't exist.

---

## 3. Before opening it to real players

Two things that will corrupt the M2 metrics gate if they ship as-is (CF 96):

1. **Probe runs emit into the live dataset.** The visual harnesses in `scratch/`
   drive the real app, so their `run_start` / `run_end` events land in the same
   PostHog project as real sessions and timestamp-bounded queries stop being
   idempotent. The harnesses block telemetry at the browser; production should
   also reject non-production origins server-side.
2. **`clientVersion` doesn't uniquely identify a canon state.** It is
   `pkg.version + short SHA`, which is fine for attribution but does not
   distinguish a dirty tree from a clean one.

Neither blocks a first deploy. Both block trusting the 200-session numbers.

---

## 4. Portal build (itch.io)

`apps/client/dist` is fully self-contained apart from the Google Fonts link.
For itch, zip `dist/`, upload as an HTML5 project, and set `index.html` as the
entry. Self-host Inter first if the portal's CSP blocks third-party font
requests.
