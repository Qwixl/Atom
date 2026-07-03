# Self-host Atom agent backend (A2A + MLS). Build from monorepo root:
#   docker compose up atom-agent --build

FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.base.json ./
COPY packages/protocol/package.json packages/protocol/tsconfig.build.json packages/protocol/tsconfig.json packages/protocol/
COPY packages/mls-session/package.json packages/mls-session/tsconfig.build.json packages/mls-session/tsconfig.json packages/mls-session/
COPY packages/a2a-transport/package.json packages/a2a-transport/tsconfig.build.json packages/a2a-transport/tsconfig.json packages/a2a-transport/
COPY packages/agent-backend/package.json packages/agent-backend/tsconfig.build.json packages/agent-backend/tsconfig.json packages/agent-backend/

RUN pnpm install --frozen-lockfile

COPY packages/protocol/src packages/protocol/src
COPY packages/mls-session/src packages/mls-session/src
COPY packages/a2a-transport/src packages/a2a-transport/src
COPY packages/agent-backend/src packages/agent-backend/src

RUN pnpm --filter @qwixl/protocol --filter @qwixl/mls-session --filter @qwixl/a2a-transport --filter @qwixl/agent-backend build
RUN pnpm --filter @qwixl/agent-backend --prod deploy /out

FROM node:22-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5204
ENV ATOM_DATA_DIR=/data

RUN addgroup -S atom && adduser -S atom -G atom
RUN mkdir -p /data && chown atom:atom /data

WORKDIR /app
COPY --from=build /out /app
USER atom

EXPOSE 5204

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5204)+'/health').then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/cli.js"]
