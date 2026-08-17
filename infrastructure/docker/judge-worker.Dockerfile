# Build context is the repository root (see docker-compose.yml), because
# npm workspaces need every workspace package.json to resolve dependencies.
FROM node:20-bookworm-slim AS base
WORKDIR /repo
RUN apt-get update -qq && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/config/package.json packages/config/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/database/package.json packages/database/package.json
COPY apps/judge-worker/package.json apps/judge-worker/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY packages/database packages/database
COPY apps/judge-worker apps/judge-worker
# Dummy DATABASE_URL: `prisma generate` only needs a syntactically valid
# datasource url, it does not connect to a database at build time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN npm run build:packages \
    && npm run build -w apps/judge-worker

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 codearena && adduser --system --uid 1001 --gid 1001 codearena
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/package.json package.json
COPY --from=build /repo/packages packages
COPY --from=build /repo/apps/judge-worker/dist apps/judge-worker/dist
COPY --from=build /repo/apps/judge-worker/package.json apps/judge-worker/package.json
USER codearena
CMD ["node", "apps/judge-worker/dist/index.js"]
