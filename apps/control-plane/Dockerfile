FROM node:22-alpine AS build
WORKDIR /app
COPY apps/control-plane/package.json apps/control-plane/tsconfig.json ./apps/control-plane/
RUN cd apps/control-plane && npm install
COPY apps/control-plane/src ./apps/control-plane/src
WORKDIR /app/apps/control-plane
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app/apps/control-plane
COPY apps/control-plane/package.json ./
RUN npm install --omit=dev
COPY --from=build /app/apps/control-plane/dist ./dist
COPY apps/control-plane/AUP.md ./AUP.md
ENV PORT=5300
EXPOSE 5300
CMD ["node", "dist/server.js"]
