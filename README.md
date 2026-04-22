# mcp-logproxy

A logging reverse proxy for [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) servers. Sits between an MCP client (OpenCode, Claude Desktop, Cursor, etc.) and one or more upstream remote MCP servers, forwarding JSON-RPC traffic and logging every call to SQLite.

## Why

MCP clients give you very little visibility into what tools are actually being called, how long they take, or what payloads are going back and forth. This proxy gives you a single chokepoint to watch traffic across every MCP server you use — useful for debugging misbehaving servers, auditing what LLMs are doing with your tools, and understanding tool call patterns before the context bill comes due.

## Features

- Remote HTTP MCP servers (stdio/local servers planned for v2).
- Reverse proxy by path prefix: `/<server-name>/...` forwards to the configured upstream.
- SQLite log with timestamp, server, JSON-RPC method, tool name, status, latency, request body, response body, error.
- Server-rendered `/logs` page with 5s auto-refresh — no JS framework required.
- `/api/logs` JSON endpoint for scripting, dashboards, or alerting integrations.
- Credential injection at the proxy: clients connect unauthenticated over your private network, and the proxy attaches API keys/bearer tokens before forwarding.

## Quick start

```bash
git clone https://github.com/<you>/mcp-logproxy.git
cd mcp-logproxy

# Configure which upstreams to proxy
$EDITOR config/upstreams.yml

# Configure secrets for upstream auth (only needed for servers that require it)
cp .env.example .env
$EDITOR .env

docker compose up -d --build
```

Then verify:

- `http://<host>:8787/logs` — live log viewer
- `http://<host>:8787/healthz` — health check
- `http://<host>:8787/api/logs` — JSON log feed

Where `<host>` is wherever you're running the container (e.g. `localhost`, a LAN hostname, or an internal IP).

## Configuring upstreams

Upstreams are defined in `config/upstreams.yml`:

```yaml
upstreams:
  - name: context7
    prefix: /context7
    target: https://mcp.context7.com/mcp
    headers:
      CONTEXT7_API_KEY: ${CONTEXT7_API_KEY}

  - name: gh_grep
    prefix: /gh_grep
    target: https://mcp.grep.app

  - name: github
    prefix: /github
    target: https://api.githubcopilot.com/mcp/
    headers:
      Authorization: Bearer ${GITHUB_PAT}
```

`${VAR}` references are resolved from environment variables at startup. Missing required vars fail startup with a clear error.

## Pointing an MCP client at the proxy

Any MCP client that supports remote HTTP servers works. Replace the direct upstream URL in your client's config with the proxy URL.

### OpenCode

In `~/.config/opencode/opencode.json`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "context7": {
      "type": "remote",
      "url": "http://<host>:8787/context7"
    },
    "gh_grep": {
      "type": "remote",
      "url": "http://<host>:8787/gh_grep"
    },
    "github": {
      "type": "remote",
      "url": "http://<host>:8787/github",
      "oauth": false
    }
  }
}
```

Set `oauth: false` for upstreams where the proxy is injecting credentials. Otherwise the client will attempt its own OAuth flow against the proxy, which doesn't implement OAuth discovery endpoints.

### Claude Desktop, Cursor, etc.

The pattern is the same: wherever the client config points at the real MCP server URL, point it at `http://<host>:8787/<server-name>` instead.

## Security notes

This proxy is designed for use on a trusted network (LAN, Tailscale, VPN). It has no authentication of its own, and it holds upstream credentials. **Do not expose it to the public internet.** If you need remote access, put it behind Tailscale, a VPN, or a reverse proxy with auth (Caddy + basic auth, Authelia, oauth2-proxy, etc.).

Fine-grained credential scoping is your responsibility. If you're configuring a GitHub PAT, use a fine-grained token with the minimum scope needed — the proxy doesn't sandbox what upstream APIs can do with the credentials it forwards.

## Development

```bash
npm install
npm run dev       # tsx watch, reloads on change
npm run build     # compile to dist/
npm start         # run the built version
```

The dev server reads config from `./config/upstreams.yml` and writes SQLite to `./data/logs.sqlite` by default. Override with `CONFIG_PATH` and `DB_PATH` env vars.

## Architecture notes

- **Fastify** with a catch-all content-type parser so bodies are forwarded as raw strings rather than re-serialized. Matters for upstreams that care about byte-exact payloads (signed requests, canonical JSON, etc.).
- **undici** for upstream requests. Faster than node-fetch, same shape.
- **better-sqlite3** in WAL mode. The synchronous API is fine because inserts are fast and the proxy is single-process; WAL lets the `/logs` viewer read while writes are happening.
- JSON-RPC method and tool name are parsed out of the request body at log time, so you can filter and group by tool without reparsing old rows.
- Hop-by-hop headers (`Connection`, `Transfer-Encoding`, etc.) are stripped on both legs per RFC 7230, and configured upstream auth headers overlay client-provided ones.

## Configuration reference

| Env var | Default | Description |
| --- | --- | --- |
| `PORT` | `8787` | Port to listen on |
| `HOST` | `0.0.0.0` | Bind address |
| `CONFIG_PATH` | `./config/upstreams.yml` | Path to upstream config file |
| `DB_PATH` | `./data/logs.sqlite` | Path to SQLite database file |
| `LOG_LEVEL` | `info` | Fastify logger level: `trace`, `debug`, `info`, `warn`, `error` |

Plus whatever env vars your upstream configs reference via `${VAR}`.

## Roadmap

- [ ] v1.1: Request/response size stats, error rate per tool, filter by status range
- [ ] v1.2: Retention policy (drop rows older than N days, or cap DB size)
- [ ] v2: stdio transport support (wrap subprocess spawn)
- [ ] v2: React dashboard with per-tool latency charts
- [ ] v2: Replay button (re-issue a logged call)
- [ ] v3: Real-time streaming via WebSocket for a devtools-Network-tab experience
- [ ] v3: Pluggable log sinks (Loki, Elasticsearch, OTLP)

## License

MIT. See `LICENSE`.

## Contributing

Issues and PRs welcome. If you're adding support for a new upstream as an example, please include a working config snippet and a note about any auth quirks.