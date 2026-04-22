# ---- Builder ----
FROM node:22-alpine AS builder

# better-sqlite3 builds a native module; needs python + build tools
RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package.json ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune dev deps for runtime copy
RUN npm prune --omit=dev

# ---- Runtime ----
FROM node:22-alpine AS runtime

# OCI standard labels — the `source` label is what tells GHCR to link this
# image to its source repository in the Packages UI. Edit the URL if you fork.
LABEL org.opencontainers.image.source="https://github.com/your-username/mcp-logproxy"
LABEL org.opencontainers.image.description="Logging reverse proxy for Model Context Protocol (MCP) servers"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

# config and data are mounted as volumes at runtime
VOLUME ["/app/config", "/app/data"]

ENV NODE_ENV=production \
    PORT=8787 \
    HOST=0.0.0.0 \
    CONFIG_PATH=/app/config/upstreams.yml \
    DB_PATH=/app/data/logs.sqlite

EXPOSE 8787

USER node

CMD ["node", "dist/server.js"]