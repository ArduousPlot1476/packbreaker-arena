# Fastify server image.
#
# Build context is the REPO ROOT, not this directory — the server depends on
# workspace packages:
#   docker build -f apps/server/Dockerfile .
#   fly deploy --config apps/server/fly.toml --dockerfile apps/server/Dockerfile .
#
# Node 20 to match .nvmrc and CI. Do not bump this without bumping both — that
# skew is exactly how a Node-22-only API reaches production green from a dev
# machine running 22.
FROM node:20-slim AS build
WORKDIR /repo
RUN corepack enable

# Manifests first, so a source-only change reuses the dependency layer.
#
# EVERY workspace member listed in pnpm-workspace.yaml must be present before
# `--frozen-lockfile` runs: the lockfile has an importer entry for each, and a
# missing manifest makes the resolved workspace disagree with the lockfile.
# Omitting the client and ui-kit here fails the install rather than skipping
# them. tooling/analytics and tooling/scripts have no package.json and are not
# workspace members, so they are correctly absent.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json          apps/client/
COPY apps/server/package.json          apps/server/
COPY packages/content/package.json     packages/content/
COPY packages/shared/package.json      packages/shared/
COPY packages/sim/package.json         packages/sim/
COPY packages/ui-kit/package.json      packages/ui-kit/
COPY tooling/eslint-config/package.json tooling/eslint-config/
COPY tooling/tsconfig/package.json      tooling/tsconfig/

# Filtered to the server's own subtree ("..." = include its dependencies), so
# the image never pulls Phaser, React or Vite. The lockfile is still honoured.
RUN pnpm install --frozen-lockfile --filter @packbreaker/server...

COPY . .

# ── runtime ─────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=4000
RUN corepack enable

COPY --from=build /repo /repo

# Workspace packages export TS source rather than a built dist (see
# CONTRIBUTING / stack conventions), so the server runs under tsx instead of
# expecting compiled siblings.
EXPOSE 4000
CMD ["pnpm", "--filter", "@packbreaker/server", "exec", "tsx", "src/index.ts"]
