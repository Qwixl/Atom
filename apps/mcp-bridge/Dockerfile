FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.base.json ./
COPY packages/ packages/
COPY apps/mcp-bridge/ apps/mcp-bridge/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qwixl/mcp-bridge... build
RUN pnpm --filter @qwixl/mcp-bridge --prod deploy --legacy /out

FROM node:22-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5211

RUN addgroup -S atom && adduser -S atom -G atom
WORKDIR /app
COPY --from=build /out /app
USER atom

EXPOSE 5211

CMD ["node", "dist/index.js"]
