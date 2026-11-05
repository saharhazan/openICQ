# syntax=docker/dockerfile:1
# The openICQ server with the web client, for an always-on server (home server, VPS).
# Build from the repository root:  docker build -f docker/Dockerfile -t openicq .

ARG NODE_IMAGE=node:26-slim

# Workspace manifests only, so dependency layers are cached until a package.json or the lockfile changes.
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/desktop-bridge/package.json packages/desktop-bridge/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY apps/desktop/package.json apps/desktop/
COPY tests/e2e/package.json tests/e2e/
# Node 25+ no longer ships corepack; install the pnpm version the repository pins.
RUN npm install -g pnpm@10.33.0 --no-fund --no-audit

# Builds the web client.
FROM manifests AS client
RUN pnpm install --frozen-lockfile --filter @openicq/client...
COPY packages/protocol packages/protocol
COPY packages/desktop-bridge packages/desktop-bridge
COPY apps/client apps/client
RUN pnpm --filter @openicq/client build

# Production dependencies of the server only.
FROM manifests AS server-deps
RUN pnpm install --prod --frozen-lockfile --filter @openicq/server...

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    PORT=5190 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/openicq.db \
    CLIENT_DIST_DIR=/app/apps/client/dist \
    LOG_LEVEL=info
WORKDIR /app
COPY --from=server-deps /app/package.json ./
COPY --from=server-deps /app/node_modules node_modules
COPY --from=server-deps /app/packages/protocol/node_modules packages/protocol/node_modules
COPY --from=server-deps /app/apps/server/node_modules apps/server/node_modules
COPY packages/protocol/package.json packages/protocol/
COPY packages/protocol/src packages/protocol/src
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY --from=client /app/apps/client/dist apps/client/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 5190
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/server/src/main.ts"]
