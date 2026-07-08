# Self-host Atom AG-UI brain stub (no A2A body). Build from monorepo root:
#   docker compose --profile brain-body up brain-stub --build

FROM node:22-alpine AS build

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.build.base.json ./
COPY packages/ packages/
COPY apps/brain-stub/ apps/brain-stub/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qwixl/brain-stub... build
RUN pnpm --filter @qwixl/brain-stub --prod deploy --legacy /out

FROM node:22-alpine

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5210

RUN addgroup -S atom && adduser -S atom -G atom
WORKDIR /app
COPY --from=build /out /app
USER atom

EXPOSE 5210

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5210)+'/agent',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:5200'}}).then(r=>process.exit(r.status===204?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
