# Self-host Atom agent backend (A2A + MLS). Build from monorepo root:
#   docker compose up atom-agent --build

FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.base.json ./
COPY packages/ packages/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qwixl/agent-backend... build
RUN pnpm --filter @qwixl/agent-backend --prod deploy --legacy /out

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

# /health is on the admin app and requires ATOM_ADMIN_TOKEN (Bearer).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5204)+'/health',{headers:{Authorization:'Bearer '+(process.env.ATOM_ADMIN_TOKEN||'')}}).then(r=>r.json()).then(j=>process.exit(j.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/cli.js"]
