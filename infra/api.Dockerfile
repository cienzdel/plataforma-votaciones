# API image: Node.js LTS runs the TypeScript directly (no build step). Built on the VM from the
# public repository at the commit being deployed.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
RUN npm install --global pnpm@10.33.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
# Production dependencies of the API and the core only. better-sqlite3 ships prebuilt binaries.
RUN pnpm install --frozen-lockfile --prod --filter "@pv/api..."
COPY packages/core/src packages/core/src
COPY apps/api/src apps/api/src

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=deps /app /app
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /app/apps/api
ENV NODE_ENV=production PV_DB=/data/pv.db PV_PORT=8080 PV_RECEPTION_PORT=8081
EXPOSE 8080 8081
CMD ["node", "src/server.ts"]
