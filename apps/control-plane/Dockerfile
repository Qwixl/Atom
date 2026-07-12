# Managed hosting control plane. Build from monorepo root:
#   docker compose build control-plane

FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.base.json ./
COPY packages/ packages/
COPY apps/control-plane/ apps/control-plane/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qwixl/control-plane... build
RUN pnpm --filter @qwixl/control-plane --prod deploy --legacy /out

FROM node:22-alpine

RUN apk add --no-cache docker-cli

ENV NODE_ENV=production
ENV PORT=5300

WORKDIR /app
COPY --from=build /out /app
# Ensure AUP is present even if deploy pruning drops non-JS assets.
COPY apps/control-plane/AUP.md ./AUP.md

EXPOSE 5300
CMD ["node", "dist/server.js"]
