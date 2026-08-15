# Build context is the repository root (see docker-compose.yml), because
# npm workspaces need every workspace package.json to resolve dependencies.
FROM node:20-bookworm-slim AS base
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w packages/shared \
    && npm run build -w apps/web

FROM base AS runtime
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 codearena && adduser --system --uid 1001 --gid 1001 codearena
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER codearena
EXPOSE 3000
ENV PORT=3000
CMD ["node", "apps/web/server.js"]
