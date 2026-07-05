FROM node:22-alpine
WORKDIR /app
COPY apps/control-plane/package.json apps/control-plane/tsconfig.json ./apps/control-plane/
RUN cd apps/control-plane && npm install --omit=dev
COPY apps/control-plane/src ./apps/control-plane/src
COPY apps/control-plane/AUP.md ./apps/control-plane/AUP.md
WORKDIR /app/apps/control-plane
RUN npx tsc -p tsconfig.json
ENV PORT=5300
EXPOSE 5300
CMD ["node", "dist/server.js"]
