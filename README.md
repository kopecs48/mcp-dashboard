# mcp-logproxy

A logging reverse proxy for Model Context Protocol (MCP) servers. Sits between
an MCP client (OpenCode, Claude Desktop, etc.) and one or more upstream remote
MCP servers, forwarding JSON-RPC traffic and logging every call to SQLite.

## Why

MCP clients don't give you much visibility into what tools are actually being
called, how long they take, or what payloads are going back and forth. This
proxy gives you a single chokepoint to watch traffic across every MCP server
you use.

## v1 scope

- **Remote HTTP MCP servers only** (stdio/local servers are v2).
- Reverse proxy by path prefix: `/<server-name>/...` forwards to the upstream.
- SQLite log with timestamp, server, JSON-RPC method, tool name, status,
  latency, request body, response body, error.
- Server-rendered `/logs` page with 5s auto-refresh.
- `/api/logs` JSON endpoint for future dashboard or scripting.

## Deploy on breadfish

```bash
git clone <your-repo> mcp-logproxy
cd mcp-logproxy

# Secrets for upstream auth
cat > .env <<'EOF'
CONTEXT7_API_KEY=ctx_...
GITHUB_PAT=ghp_...
EOF

docker compose up -d --build
```

Then:

- `http://breadfish.lan:8787/logs` — live log viewer
- `http://breadfish.lan:8787/healthz` — health check

## Point OpenCode at it

Replace the direct upstream URLs in your `~/.config/opencode/opencode.json`
with proxy URLs:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "http://breadfish.lan:8787/context7"
    },
    "gh_grep": {
      "type": "remote",
      "url": "http://breadfish.lan:8787/gh_grep"
    },
    "github": {
      "type": "remote",
      "url": "http://breadfish.lan:8787/github",
      "oauth": false
    }
  }
}
```

Note that upstream auth (Context7 key, GitHub PAT) now lives in the proxy's
`.env`, not in OpenCode's config. OpenCode talks to the proxy unauthenticated
on your LAN; the proxy attaches credentials before forwarding.

## Dev loop

```bash
npm install
npm run dev    # tsx watch, reloads on change
```

## Architecture notes

- Fastify with a catch-all content-type parser so bodies are forwarded as raw
  strings rather than re-serialized (important for signed/canonical payloads
  if any upstream ever cares about byte-exactness).
- undici for upstream requests (faster than node-fetch, same shape).
- better-sqlite3 in WAL mode — synchronous API is fine because inserts are
  fast and we're single-process.
- JSON-RPC method and tool name are parsed out of the request body so you can
  filter/group by tool in future dashboards.

## Roadmap

- [ ] v1.1: Request/response size histograms, error rate per tool
- [ ] v2: stdio transport support (wrap subprocess spawn on MacBook side)
- [ ] v2: React dashboard with per-tool latency charts
- [ ] v2: Replay button (re-issue a logged call)
- [ ] v3: Real-time streaming via WebSocket for a "devtools Network tab" feel
