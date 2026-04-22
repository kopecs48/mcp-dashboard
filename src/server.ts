import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { openDb, recentLogs } from "./db.js";
import { makeProxyHandler } from "./proxy.js";
import { renderLogs } from "./views/logs.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const DB_PATH = process.env.DB_PATH ?? "./data/logs.sqlite";
const CONFIG_PATH = process.env.CONFIG_PATH ?? "./config/upstreams.yml";

async function main() {
  const upstreams = loadConfig(CONFIG_PATH);
  const db = openDb(DB_PATH);

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? "info" },
    // Large MCP tool responses (e.g. github) can exceed the default 1MB limit.
    bodyLimit: 10 * 1024 * 1024,
  });

  // Parse any content-type as text so we can forward bytes faithfully.
  // Fastify's default JSON parser is fine for JSON-RPC; we add a fallback
  // for anything else (SSE, binary, etc).
  app.addContentTypeParser(
    "*",
    { parseAs: "string" },
    (_req, body, done) => done(null, body),
  );

  // Register one route group per upstream. We accept all methods so that
  // GET (for SSE) and POST (for JSON-RPC) both flow through.
  for (const u of upstreams) {
    const handler = makeProxyHandler(db, u);
    app.all(`${u.prefix}`, handler);
    app.all(`${u.prefix}/*`, handler);
    app.log.info(`proxying ${u.prefix} -> ${u.target}`);
  }

  // Logs viewer
  app.get("/logs", async (req, reply) => {
    const server =
      typeof (req.query as any)?.server === "string"
        ? (req.query as any).server
        : undefined;
    const rows = recentLogs(db, { limit: 200, server });
    reply
      .header("content-type", "text/html; charset=utf-8")
      .send(renderLogs(rows, upstreams.map((u) => u.name)));
  });

  // Simple JSON API for future dashboard / scripting
  app.get("/api/logs", async (req) => {
    const q = req.query as { server?: string; limit?: string };
    return {
      rows: recentLogs(db, {
        limit: q.limit ? Number(q.limit) : 200,
        server: q.server,
      }),
    };
  });

  app.get("/healthz", async () => ({ ok: true }));

  app.get("/", async (_req, reply) => {
    reply.redirect("/logs");
  });

  await app.listen({ port: PORT, host: HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
